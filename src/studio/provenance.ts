// Copyright and attribution policy: every discovered item carries an
// explicit provenance chain. Discovery and factual grounding remain distinct
// from copying source expression — the pipeline stores metadata and links,
// never reproduces third-party articles wholesale.

import type { ContentSource } from "@prisma/client";
import type { DiscoveredSourceItem } from "./adapters/types";

export type ProvenanceRecord = {
  publisher: string;
  publisherDomain: string | null;
  sourceFeedUrl: string | null;
  sourceUrl: string | null;
  author: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  license: string | null;
  policy: "metadata-only";
};

/** Attribution chain for a discovered item — copyright/provenance policy. */
export function buildProvenance(
  source: Pick<ContentSource, "name" | "domain" | "url">,
  item: DiscoveredSourceItem,
  retrievedAt: Date = new Date(),
): ProvenanceRecord {
  return {
    publisher: source.name,
    publisherDomain: source.domain ?? null,
    sourceFeedUrl: source.url ?? null,
    sourceUrl: item.sourceUrl ?? item.canonicalUrl ?? null,
    author: item.author ?? null,
    publishedAt: item.publishedAt ?? null,
    retrievedAt: retrievedAt.toISOString(),
    license: null,
    policy: "metadata-only",
  };
}

/** Merge adapter-provided attribution with the mandatory provenance chain. */
export function mergeProvenance(
  existing: Record<string, unknown> | null | undefined,
  provenance: ProvenanceRecord,
): Record<string, unknown> {
  return {
    ...(existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {}),
    ...provenance,
  };
}
