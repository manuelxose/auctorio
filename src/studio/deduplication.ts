// Multi-signal deduplication.
//
// Critical distinction:
//   DUPLICATE ITEM          → same article ingested twice (same source, same
//                             canonical URL, or identical content) → DISCARD.
//   SAME STORY, OTHER SOURCE → a different publisher covering the same event →
//                             KEEP the item and link it to the existing
//                             story cluster. Never discarded.
//
// Signals, in order of strength:
//   1. source + externalId
//   2. canonical URL hash
//   3. content hash (time-windowed — evergreen reposts must not be lost)
//   4. normalized headline fingerprint (cross-source → same story)
//   5. headline similarity within the story window (→ same story)

import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import type { DiscoveredSourceItem } from "./adapters/types";
import { titleSimilarity } from "./editorial";

const prisma = getPrismaClient();

export type DedupReason =
  | "source_external_id"
  | "canonical_url"
  | "content_hash"
  | "normalized_title";

export type DedupResult =
  | { outcome: "duplicate"; sourceItemId: string | null; reason: DedupReason; updated: boolean }
  | { outcome: "new_item"; clusterLinkId: string | null; reason: DedupReason | null };

export type DedupOptions = {
  /** Content-hash matches older than this are treated as new items (evergreen reposts). */
  contentHashWindowMs?: number;
  /** Title-signal matches are only considered within this window. */
  sameStoryWindowMs?: number;
  /** Titles shorter than this skip headline-fingerprint matching (false positives). */
  minTitleLength?: number;
  /** Exact-title cross-source matches link to the existing cluster via this floor. */
  storyTitleSimilarity?: number;
};

export const DEFAULT_DEDUP_OPTIONS: Required<DedupOptions> = {
  contentHashWindowMs: 30 * 24 * 3_600_000,
  sameStoryWindowMs: 7 * 24 * 3_600_000,
  minTitleLength: 12,
  storyTitleSimilarity: 0.6,
};

export type DedupInput = {
  tenantId: string;
  sourceId: string;
  item: DiscoveredSourceItem;
  contentHash: string;
  normalizedTitleHash: string | null;
  canonicalUrlHash: string | null;
  now?: Date;
};

type ExistingItem = { id: string; clusterId: string | null; title: string; contentHash: string };

export function resolveDedupOptions(overrides: DedupOptions = {}): Required<DedupOptions> {
  return { ...DEFAULT_DEDUP_OPTIONS, ...overrides };
}

/** Pure classification of a found match — exported for deterministic tests. */
export function classifyMatch(
  kind: "external_id" | "canonical_url" | "content_hash",
  existing: { contentHash: string },
  incoming: { contentHash: string },
): { outcome: "duplicate"; updated: boolean } | { outcome: "new_item" } {
  // Same identity with changed content → developing story update, not a dup.
  const updated = existing.contentHash !== incoming.contentHash;
  return { outcome: "duplicate", updated };
}

/** Evaluate all dedup signals against the database. Never throws for signal
 *  lookups; races on insert are handled by the caller (P2002 fallback). */
export async function evaluateDedup(input: DedupInput, options: DedupOptions = {}): Promise<DedupResult> {
  const opts = resolveDedupOptions(options);
  const now = input.now ?? new Date();
  const { tenantId, sourceId, item } = input;

  // 1. Source + external id.
  const byExternalId = await prisma.sourceItem.findFirst({
    where: { tenantId, sourceId, externalId: item.externalId },
    select: { id: true, clusterId: true, title: true, contentHash: true },
  });
  if (byExternalId) {
    if (byExternalId.contentHash !== input.contentHash) {
      return { outcome: "duplicate", sourceItemId: byExternalId.id, reason: "source_external_id", updated: true };
    }
    return { outcome: "duplicate", sourceItemId: byExternalId.id, reason: "source_external_id", updated: false };
  }

  // 2. Canonical URL (any source — the same page fetched by two sources is the
  //    same item).
  if (input.canonicalUrlHash) {
    const byUrl = await prisma.sourceItem.findFirst({
      where: { tenantId, canonicalUrlHash: input.canonicalUrlHash },
      select: { id: true, clusterId: true, title: true, contentHash: true },
    });
    if (byUrl) {
      return {
        outcome: "duplicate",
        sourceItemId: byUrl.id,
        reason: "canonical_url",
        updated: byUrl.contentHash !== input.contentHash,
      };
    }
  }

  // 3. Content hash within the window (identical syndicated content).
  const byContentHash = await findWithinWindow(tenantId, input.contentHash, "contentHash", now, opts.contentHashWindowMs);
  if (byContentHash) {
    return { outcome: "duplicate", sourceItemId: byContentHash.id, reason: "content_hash", updated: false };
  }

  // 4. Normalized headline fingerprint — cross-source exact title: SAME STORY.
  //    Never discarded; linked to the existing cluster when similar enough.
  if (input.normalizedTitleHash && item.title.length >= opts.minTitleLength) {
    const byTitle = await findWithinWindow(tenantId, input.normalizedTitleHash, "normalizedTitleHash", now, opts.sameStoryWindowMs);
    if (byTitle) {
      if (byTitle.clusterId) {
        const similarity = titleSimilarity(item.title, byTitle.title);
        if (similarity >= opts.storyTitleSimilarity) {
          return { outcome: "new_item", clusterLinkId: byTitle.clusterId, reason: "normalized_title" };
        }
      }
      // Same headline exists but is not clustered yet: keep the signal so the
      // pipeline can merge them through similarity clustering.
      return { outcome: "new_item", clusterLinkId: null, reason: "normalized_title" };
    }
  }

  return { outcome: "new_item", clusterLinkId: null, reason: null };
}

async function findWithinWindow(
  tenantId: string,
  hash: string,
  field: "contentHash" | "normalizedTitleHash",
  now: Date,
  windowMs: number,
): Promise<ExistingItem | null> {
  const since = new Date(now.getTime() - windowMs);
  const where: Prisma.SourceItemWhereInput = {
    tenantId,
    [field]: hash,
    discoveredAt: { gte: since },
  };
  const match = await prisma.sourceItem.findFirst({
    where,
    orderBy: { discoveredAt: "desc" },
    select: { id: true, clusterId: true, title: true, contentHash: true },
  });
  return match;
}
