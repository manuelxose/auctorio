// Source pack contract: reusable bootstrap configuration. Packs are NOT
// hardcoded into business logic — importing a pack creates ordinary
// ContentSource rows (and optionally EnrichmentProvider rows) in the
// database, which is the runtime source of truth.

import type { ContentSourceType } from "@prisma/client";

export type SourcePackEntry = {
  /** Stable entry key (also used as the source name suffix for imports). */
  id: string;
  name: string;
  domain: string;
  adapter: ContentSourceType;
  endpoint: string;
  /** How the endpoint was established: official_rss | official_atom |
   *  official_sitemap | news_sitemap | publisher_endpoint | link_alternate |
   *  html_discovery | manual */
  discoveryMethod: string;
  category: string;
  language: string;
  country: string;
  /** Editorial authority 0..1. */
  authority: number;
  /** Trust score 0..1. */
  trust: number;
  priority: number;
  refreshIntervalMinutes: number;
  rateLimits: Record<string, unknown> | null;
  robotsPolicy: Record<string, unknown> | null;
  extractionPolicy: Record<string, unknown> | null;
  /** Default state after import; the operator can change this at import time. */
  enabled: boolean;
  tags: string[];
  /** Operational/legal notes shown in the Studio and support matrix. */
  notes?: string;
  restrictions?: string;
};

export type EnrichmentProviderSeed = {
  key: string;
  name: string;
  providerType: string;
  baseUrl: string | null;
  endpoint: string | null;
  credentialsRef: string | null;
  category: string;
  enabled: boolean;
  configuration: Record<string, unknown> | null;
  notes?: string;
};

export type SourcePackDefinition = {
  key: string;
  name: string;
  description: string;
  category: string;
  language: string;
  country: string;
  optional: boolean;
  entries: SourcePackEntry[];
  providers: EnrichmentProviderSeed[];
};
