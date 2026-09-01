// Intelligence domain plugins (Phase 3).
//
// Core Auctorio intelligence is domain-agnostic: entities, clustering,
// verification, scoring. Domain knowledge (movie/TV, sports, finance…) is
// contributed through this plugin interface. The core never imports domain
// code; sites opt into domains via their editorial profile or tenant
// intelligence settings.

import type { EntityExtraction } from "../entities/model";
import type { SiteEditorialProfile } from "../intelligence/site-editorial-profile";
import type { LevelBudget } from "../intelligence/cost-control";
import type { ProviderCacheStats } from "../enrichment/provider-cache";

export type DomainPluginContext = {
  tenantId: string;
  siteId?: string | null;
  /** Compact editorial profile of the connected site (may be absent). */
  siteProfile?: SiteEditorialProfile | null;
  /** Cascade budget — plugins must respect caps. */
  budget?: LevelBudget;
  /** Shared provider cache stats for observability. */
  stats?: ProviderCacheStats;
  now?: Date;
};

/** Result of one domain's entity extraction for one source item. */
export type DomainEntityResult = {
  extractions: EntityExtraction[];
  /** Signal cost of this step (always 0 for level-1 deterministic work). */
  cost: { aiCalls: number; enrichmentCalls: number };
};

/** A domain's assessment of how relevant an entity/context is to a site. */
export type DomainRelevanceSignal = {
  entityType: string;
  entityName: string;
  score: number; // 0..1
  reason: string;
};

export interface IntelligenceDomainPlugin {
  /** Stable domain id, e.g. "movie_tv". */
  readonly domain: string;
  /** Entity types this domain contributes (may overlap generic types). */
  readonly entityTypes: readonly string[];
  /**
   * Level 1: deterministic, cheap entity extraction from a raw item.
   * Never performs network or AI calls.
   */
  extractEntities(item: {
    title: string;
    description?: string | null;
    text?: string | null;
    publishedAt?: Date | null;
  }, context: DomainPluginContext): DomainEntityResult;

  /**
   * Level 2: cached enrichment through external providers. Called only for
   * entities this domain produced (or generic creative_work entities when
   * the site opts into this domain). Must respect the cost budget.
   */
  enrichEntities(
    entities: Array<{ id: string; type: string; name: string }>,
    context: DomainPluginContext,
  ): Promise<{ aiCalls: number; enrichmentCalls: number; cacheHits: number }>;

  /**
   * Domain-specific relevance signals against a site editorial profile.
   * Deterministic and cheap; used by candidate scoring (siteFit, relevance).
   */
  relevanceSignals(
    entities: Array<{ type: string; name: string }>,
    context: DomainPluginContext,
  ): DomainRelevanceSignal[];
}

const registry = new Map<string, IntelligenceDomainPlugin>();

export function registerDomainPlugin(plugin: IntelligenceDomainPlugin): void {
  if (registry.has(plugin.domain)) {
    throw new Error(`domain plugin already registered: ${plugin.domain}`);
  }
  registry.set(plugin.domain, plugin);
}

export function getDomainPlugin(domain: string): IntelligenceDomainPlugin | null {
  return registry.get(domain) ?? null;
}

export function listDomainPlugins(): IntelligenceDomainPlugin[] {
  return Array.from(registry.values());
}

export function listDomainPluginNames(): string[] {
  return Array.from(registry.keys());
}
