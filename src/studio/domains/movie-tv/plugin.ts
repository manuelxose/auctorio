// Movie/TV intelligence domain plugin (Phase 3).
//
// Implemented strictly as a DOMAIN MODULE. Core Auctorio intelligence never
// references TMDB, titles, seasons, or franchises. The application remains
// fully usable for non-entertainment sites.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../../infrastructure/db/prisma";
import {
  MOVIE_TV_ENTITY_TYPES,
  buildEntityCanonicalKey,
  clampConfidence,
  type EntityExtraction,
} from "../../entities/model";
import { ProviderEngine, type EnrichmentCategory } from "../../enrichment/engine";
import { ProviderRateLimitedError, ProviderUnavailableError } from "../../enrichment/adapter";
import { getTmdbProvider } from "../../enrichment/tmdb";
import { getOmdbProvider } from "../../enrichment/omdb";
import { getImdbProvider } from "../../enrichment/imdb";
import { getIntelligenceSettings } from "../../intelligence/intelligence-settings";
import { canUseEnrichment, bumpEnrichmentCall } from "../../intelligence/cost-control";
import { createProviderCacheStats } from "../../enrichment/provider-cache";
import { getDomainPlugin, registerDomainPlugin } from "../plugin";
import {
  cleanWorkTitle,
  matchWork,
  normalizedTitleEqual,
  type TitleMatch,
} from "./matcher";
import type {
  DomainEntityResult,
  DomainPluginContext,
  DomainRelevanceSignal,
  IntelligenceDomainPlugin,
} from "../plugin";

const prisma = getPrismaClient();

/** Streaming platforms / channels — domain lexicon, not site-specific. */
const STREAMING_PLATFORMS: Array<[string, string[]]> = [
  ["Netflix", ["netflix"]],
  ["Prime Video", ["prime video", "amazon prime"]],
  ["Disney+", ["disney+", "disney plus"]],
  ["Max", ["hbo max", "hbo", " max"]],
  ["Apple TV+", ["apple tv+", "apple tv"]],
  ["Hulu", ["hulu"]],
  ["Paramount+", ["paramount+", "paramount plus"]],
  ["Peacock", ["peacock"]],
  ["Crunchyroll", ["crunchyroll"]],
  ["BBC", ["bbc"]],
  ["CBS", ["cbs"]],
  ["NBC", ["nbc"]],
  ["ABC", ["abc"]],
  ["HBO", ["hbo"]],
  ["FX", ["fx network", "fx"]],
  ["AMC", ["amc"]],
  ["Showtime", ["showtime"]],
];

const FRANCHISE_PATTERN = /\b((?:the\s+)?[\w'’-]+)\s+(universe|franchise)\b/i;

let sharedEngine: ProviderEngine | null = null;

export function getMovieTvProviderEngine(): ProviderEngine {
  if (!sharedEngine) {
    sharedEngine = new ProviderEngine([getTmdbProvider(), getOmdbProvider(), getImdbProvider()]);
  }
  return sharedEngine;
}

/** Set a custom engine (tests inject deterministic fake providers). */
export function setMovieTvProviderEngine(engine: ProviderEngine | null): void {
  sharedEngine = engine;
}

export function workTypeToEntityType(match: TitleMatch): "movie" | "tv_series" | "creative_work" {
  if (match.season !== null || match.episode !== null) {
    return "tv_series";
  }
  if (match.workType === "movie") {
    return "movie";
  }
  if (match.workType === "tv_series") {
    return "tv_series";
  }
  return "creative_work";
}

export class MovieTvIntelligencePlugin implements IntelligenceDomainPlugin {
  readonly domain = "movie_tv";
  readonly entityTypes: readonly string[] = MOVIE_TV_ENTITY_TYPES;

  extractEntities(item: {
    title: string;
    description?: string | null;
    text?: string | null;
    publishedAt?: Date | null;
  }): DomainEntityResult {
    const extractions: EntityExtraction[] = [];
    const title = item.title ?? "";
    const description = item.description ?? "";

    const match = matchWork({ title, description, text: item.text });
    // Emit a work entity only with a real work cue: work-type wording, a
    // year/season, or a title artifact (colon/quotes). Bare ambiguous
    // headlines ("Central Bank Raises Rates") are NOT creative works.
    const hasWorkCue =
      match.workType !== "unknown" ||
      match.year !== null ||
      match.season !== null ||
      /[:“”'"()]/.test(title);
    if (match.candidateTitle.length >= 2 && hasWorkCue) {
      const type = workTypeToEntityType(match);
      const evidence = [
        { field: "title" as const, match: title.slice(0, 120), method: "movie_tv_matcher" },
        ...match.signals.map((signal) => ({ field: "title" as const, match: signal, method: "movie_tv_signal" })),
      ];
      extractions.push({
        domain: this.domain,
        type,
        name: match.candidateTitle,
        confidence: match.confidence,
        evidence,
        aliases: [title.slice(0, 120)].filter((alias) => alias !== match.candidateTitle),
      });
      if (match.year !== null) {
        extractions[extractions.length - 1].metadata = { year: match.year };
      }
      if (match.season !== null) {
        extractions.push({
          domain: this.domain,
          type: "season",
          name: `${match.candidateTitle} Season ${match.season}`,
          confidence: clampConfidence(match.confidence - 0.1),
          evidence: [{ field: "title", match: title.slice(0, 120), method: "season_pattern" }],
        });
      }
    }

    // Franchise mentions.
    const haystack = `${title} ${description}`;
    const franchiseMatch = FRANCHISE_PATTERN.exec(haystack);
    if (franchiseMatch) {
      extractions.push({
        domain: this.domain,
        type: "franchise",
        name: `${franchiseMatch[1]} ${franchiseMatch[2]}`,
        confidence: 0.7,
        evidence: [{ field: "description", match: franchiseMatch[0], method: "franchise_pattern" }],
      });
    }

    // Streaming platform / channel mentions.
    const lower = haystack.toLowerCase();
    for (const [name, patterns] of STREAMING_PLATFORMS) {
      if (patterns.some((pattern) => lower.includes(pattern))) {
        extractions.push({
          domain: this.domain,
          type: "streaming_service",
          name,
          confidence: 0.75,
          evidence: [{ field: patterns.some((pattern) => title.toLowerCase().includes(pattern)) ? "title" : "description", match: name, method: "platform_lexicon" }],
        });
        if (extractions.length > 12) {
          break;
        }
      }
    }

    return { extractions: extractions.slice(0, 15), cost: { aiCalls: 0, enrichmentCalls: 0 } };
  }

  async enrichEntities(
    entities: Array<{ id: string; type: string; name: string }>,
    context: DomainPluginContext,
  ): Promise<{ aiCalls: number; enrichmentCalls: number; cacheHits: number }> {
    const settings = await getIntelligenceSettings(context.tenantId);
    const engine = getMovieTvProviderEngine();
    let enrichmentCalls = 0;
    let cacheHits = 0;

    for (const entity of entities) {
      const workable = entity.type === "movie" || entity.type === "tv_series" || entity.type === "creative_work";
      if (!workable) {
        continue;
      }
      if (context.budget && !canUseEnrichment(context.budget)) {
        break;
      }

      const match = matchWork({ title: entity.name });
      const resourceType: "movie" | "tv" = entity.type === "tv_series" ? "tv" : "movie";
      try {
        const outcome = await engine.enrich(
          "identity" as EnrichmentCategory,
          {
            query: cleanWorkTitle(entity.name),
            year: match.year,
            resourceType,
          },
          settings.providerPrecedence.identity,
          {
            tenantId: context.tenantId,
            stats: context.stats ?? createProviderCacheStats(),
            onProviderCall: () => {
              enrichmentCalls += 1;
              if (context.budget) {
                bumpEnrichmentCall(context.budget);
              }
            },
          },
        );
        if (!outcome) {
          continue;
        }
        if (outcome.fromCache) {
          cacheHits += 1;
        }
        await engine.saveEnrichment(context.tenantId, entity.id, outcome);

        // Merge provider identity into the entity (external ids + aliases).
        const externalIds: Record<string, string> = {};
        if (outcome.result.match.id) {
          externalIds[outcome.providerKey] = outcome.result.match.id;
        }
        await prisma.entity.update({
          where: { id: entity.id },
          data: {
            externalIds: {
              ...(await this.readExternalIds(entity.id)),
              ...externalIds,
            } as Prisma.InputJsonValue,
            metadata: {
              year: outcome.result.match.year,
              provider: outcome.providerKey,
              matchMethod: outcome.result.matchMethod,
              attribution: outcome.result.attribution,
            } as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        if (error instanceof ProviderRateLimitedError || error instanceof ProviderUnavailableError) {
          // Optional providers never break the pipeline.
          continue;
        }
        continue;
      }
    }
    return { aiCalls: 0, enrichmentCalls, cacheHits };
  }

  private async readExternalIds(entityId: string): Promise<Record<string, unknown>> {
    const entity = await prisma.entity.findUnique({ where: { id: entityId }, select: { externalIds: true } });
    if (!entity || !entity.externalIds || typeof entity.externalIds !== "object" || Array.isArray(entity.externalIds)) {
      return {};
    }
    return entity.externalIds as Record<string, unknown>;
  }

  relevanceSignals(entities: Array<{ type: string; name: string }>, context: DomainPluginContext): DomainRelevanceSignal[] {
    const signals: DomainRelevanceSignal[] = [];
    const profile = context.siteProfile;
    if (!profile) {
      return signals;
    }
    const profileText = [...profile.topics, ...profile.categories].map((entry) => entry.toLowerCase()).join(" ");
    const siteIsEntertainment = /\b(movie|movies|film|films|cinema|serie|series|streaming|tv|television|pelicula|peliculas|estrenos)\b/.test(profileText);
    if (!siteIsEntertainment) {
      return signals;
    }
    for (const entity of entities) {
      const workType = entity.type === "movie" || entity.type === "tv_series" || entity.type === "creative_work";
      if (workType) {
        signals.push({
          entityType: entity.type,
          entityName: entity.name,
          score: entity.type === "movie" ? 0.8 : 0.75,
          reason: `site_covers_${entity.type}`,
        });
      } else if (entity.type === "franchise") {
        signals.push({ entityType: entity.type, entityName: entity.name, score: 0.7, reason: "site_covers_franchises" });
      } else if (entity.type === "streaming_service") {
        signals.push({ entityType: entity.type, entityName: entity.name, score: 0.6, reason: "site_covers_platforms" });
      }
    }
    return signals.slice(0, 10);
  }
}

/** Register at module load (idempotent). */
export function registerMovieTvPlugin(): IntelligenceDomainPlugin {
  const existing = getDomainPlugin("movie_tv");
  if (existing) {
    return existing;
  }
  const plugin = new MovieTvIntelligencePlugin();
  registerDomainPlugin(plugin);
  return plugin;
}

/** Test helper: the canonical key used by this plugin for a work. */
export function movieTvEntityKey(type: string, name: string): string {
  return buildEntityCanonicalKey("movie_tv", type, name);
}

export { normalizedTitleEqual };
