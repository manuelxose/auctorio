// Provider engine (Phase 3): owns precedence, caching, rate limiting,
// fallback and persistence. Business code asks for a *category* of data
// (identity / rating / metadata), never for a specific provider.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import {
  buildProviderCacheKey,
  lookupProviderCache,
  providerRateSlotAvailable,
  recordCacheStat,
  recordProviderRequest,
  storeProviderCache,
  type CacheLookup,
  type ProviderCacheStats,
  type ProviderRatePolicy,
} from "./provider-cache";
import {
  ProviderRateLimitedError,
  ProviderUnavailableError,
  type EnrichmentLookupInput,
  type EnrichmentLookupResult,
  type EnrichmentProviderAdapter,
} from "./adapter";

const prisma = getPrismaClient();

export type EnrichmentCategory = "identity" | "rating" | "metadata";

export type ProviderPrecedence = {
  identity: string[];
  rating: string[];
  metadata: string[];
};

export const DEFAULT_PROVIDER_PRECEDENCE: ProviderPrecedence = {
  identity: ["tmdb", "omdb", "imdb"],
  rating: ["imdb", "tmdb", "omdb"],
  metadata: ["tmdb", "imdb", "omdb"],
};

export function normalizePrecedence(config: unknown): ProviderPrecedence {
  const source = (config ?? {}) as Partial<Record<EnrichmentCategory, unknown>>;
  const list = (value: unknown, fallback: string[]): string[] =>
    Array.isArray(value) ? value.map(String) : fallback;
  return {
    identity: list(source.identity, DEFAULT_PROVIDER_PRECEDENCE.identity),
    rating: list(source.rating, DEFAULT_PROVIDER_PRECEDENCE.rating),
    metadata: list(source.metadata, DEFAULT_PROVIDER_PRECEDENCE.metadata),
  };
}

export type EnrichmentOutcome = {
  category: EnrichmentCategory;
  providerKey: string;
  result: EnrichmentLookupResult;
  fromCache: boolean;
  stale: boolean;
};

export type ProviderEngineContext = {
  tenantId: string;
  stats: ProviderCacheStats;
  /** Per-provider rate policies, keyed by provider key. */
  ratePolicies?: Record<string, ProviderRatePolicy>;
  /** Called for every real (uncached) provider request. */
  onProviderCall?: (providerKey: string) => void;
};

/** Negative-cache TTL: not-found results are re-checkable much sooner. */
const NEGATIVE_TTL_MS = 6 * 3_600_000;

export class ProviderEngine {
  private readonly adapters: Map<string, EnrichmentProviderAdapter>;
  private readonly inFlight = new Map<string, Promise<EnrichmentLookupResult>>();

  constructor(adapters: EnrichmentProviderAdapter[]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.providerKey, adapter]));
  }

  addAdapter(adapter: EnrichmentProviderAdapter): void {
    this.adapters.set(adapter.providerKey, adapter);
  }

  getAdapter(providerKey: string): EnrichmentProviderAdapter | undefined {
    return this.adapters.get(providerKey);
  }

  listAdapterKeys(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Resolve a category of data for one lookup across the configured
   * precedence list. Returns null when every configured provider failed or
   * was unavailable. Unconfigured providers are skipped without caching.
   */
  async enrich(
    category: EnrichmentCategory,
    input: EnrichmentLookupInput,
    precedence: string[],
    context: ProviderEngineContext,
  ): Promise<EnrichmentOutcome | null> {
    let lastRateLimited = false;
    for (const providerKey of precedence) {
      const adapter = this.adapters.get(providerKey);
      if (!adapter) {
        continue;
      }
      if (!adapter.isConfigured()) {
        continue;
      }
      if (!providerRateSlotAvailable(providerKey, context.ratePolicies?.[providerKey])) {
        lastRateLimited = true;
        continue;
      }

      const cacheKey = buildProviderCacheKey(providerKey, input.resourceType, {
        category,
        query: input.query,
        year: input.year ?? null,
      });
      const cached = await lookupProviderCache(context.tenantId, providerKey, input.resourceType, cacheKey);
      recordCacheStat(context.stats, cached);

      if (cached.hit && !cached.negative) {
        if (cached.stale) {
          // Stale-while-revalidate: serve now, refresh behind the caller.
          this.revalidate(category, input, providerKey, adapter, cacheKey, context).catch(() => undefined);
        }
        return {
          category,
          providerKey,
          result: cached.payload as EnrichmentLookupResult,
          fromCache: true,
          stale: cached.stale,
        };
      }
      if (cached.negative) {
        // Known-missing for this provider → next in precedence.
        continue;
      }

      try {
        const result = await this.performLookup(category, input, providerKey, adapter, context);
        await storeProviderCache(context.tenantId, providerKey, input.resourceType, cacheKey, result, {
          ttlMs: ttlForCategory(category),
        });
        context.stats.stores += 1;
        return { category, providerKey, result, fromCache: false, stale: false };
      } catch (error) {
        if (error instanceof ProviderUnavailableError) {
          await storeProviderCache(context.tenantId, providerKey, input.resourceType, cacheKey, null, {
            ttlMs: NEGATIVE_TTL_MS,
            negative: true,
          });
          context.stats.stores += 1;
          continue;
        }
        if (error instanceof ProviderRateLimitedError) {
          lastRateLimited = true;
          continue;
        }
        // Unknown failure: treat as unavailable and move on.
        continue;
      }
    }
    if (lastRateLimited) {
      throw new ProviderRateLimitedError(precedence[0] ?? "provider");
    }
    return null;
  }

  /** Coalesced real provider call: identical concurrent lookups share one. */
  private async performLookup(
    _category: EnrichmentCategory,
    input: EnrichmentLookupInput,
    providerKey: string,
    adapter: EnrichmentProviderAdapter,
    context: ProviderEngineContext,
  ): Promise<EnrichmentLookupResult> {
    const coalesceKey = `${providerKey}|${input.resourceType}|${input.query}|${input.year ?? ""}`;
    const inFlight = this.inFlight.get(coalesceKey);
    if (inFlight) {
      return inFlight;
    }
    const promise = adapter
      .lookup(input)
      .then((result) => {
        recordProviderRequest(providerKey);
        context.onProviderCall?.(providerKey);
        return result;
      })
      .finally(() => {
        this.inFlight.delete(coalesceKey);
      });
    this.inFlight.set(coalesceKey, promise);
    return promise;
  }

  private async revalidate(
    category: EnrichmentCategory,
    input: EnrichmentLookupInput,
    providerKey: string,
    adapter: EnrichmentProviderAdapter,
    cacheKey: string,
    context: ProviderEngineContext,
  ): Promise<void> {
    if (!providerRateSlotAvailable(providerKey, context.ratePolicies?.[providerKey])) {
      return;
    }
    try {
      const result = await this.performLookup(category, input, providerKey, adapter, context);
      await storeProviderCache(context.tenantId, providerKey, input.resourceType, cacheKey, result, {
        ttlMs: ttlForCategory(category),
      });
    } catch {
      // SWR best-effort: keep serving stale data on refresh failure.
    }
  }

  /** Persist an enrichment outcome against an entity row. One row per
   *  entity+provider; identity lookups already carry rating/metadata data. */
  async saveEnrichment(tenantId: string, entityId: string, outcome: EnrichmentOutcome): Promise<void> {
    const match = outcome.result.match;
    const data = {
      genres: match.genres,
      popularity: match.popularity,
      rating: match.rating,
      votes: match.votes,
      cast: match.cast,
      crew: match.crew,
      studios: match.studios,
      franchise: match.franchise,
      overview: match.overview,
      posterUrl: match.posterUrl,
      backdropUrl: match.backdropUrl,
      watchProviders: match.watchProviders,
      extra: match.extra,
      alternatives: outcome.result.alternatives.map((alt) => ({ id: alt.id, title: alt.title, year: alt.year })),
      attribution: outcome.result.attribution,
      category: outcome.category,
    };
    await prisma.providerEnrichment.upsert({
      where: { entityId_providerKey: { entityId, providerKey: outcome.providerKey } },
      create: {
        tenantId,
        entityId,
        providerKey: outcome.providerKey,
        providerEntityId: match.id,
        resourceType: outcome.result.resourceType,
        title: match.title,
        originalTitle: match.originalTitle,
        releaseDate: match.releaseDate ? new Date(match.releaseDate) : null,
        matchMethod: outcome.result.matchMethod,
        confidence: outcome.result.confidence,
        data: data as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + ttlForCategory(outcome.category)),
      },
      update: {
        providerEntityId: match.id,
        resourceType: outcome.result.resourceType,
        title: match.title,
        originalTitle: match.originalTitle,
        releaseDate: match.releaseDate ? new Date(match.releaseDate) : null,
        matchMethod: outcome.result.matchMethod,
        confidence: outcome.result.confidence,
        data: data as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + ttlForCategory(outcome.category)),
        cachedAt: new Date(),
      },
    });
  }

  resetCoalescing(): void {
    this.inFlight.clear();
  }
}

function ttlForCategory(category: EnrichmentCategory): number {
  switch (category) {
    case "identity":
      return 30 * 24 * 3_600_000;
    case "metadata":
      return 7 * 24 * 3_600_000;
    case "rating":
      return 24 * 3_600_000;
  }
}
