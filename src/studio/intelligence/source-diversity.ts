// Source diversity (Phase 3): several independent publishers must score
// differently from ten syndicated copies of the same source.
//
// Mirrors, syndicated duplicates and near-identical copies never count as
// independent confirmation.

export type PublisherGroup = {
  /** Group key: normalized publisher identity (root domain family). */
  key: string;
  /** Display label (publisher domain). */
  label: string;
  /** Item ids in this group. */
  itemIds: string[];
  /** Whether this group is only near-identical copies of another group. */
  syndicated: boolean;
};

export type DiversityInput = {
  itemId: string;
  sourceDomain: string | null;
  sourceName: string | null;
  contentHash: string;
  title: string;
};

export type DiversityResult = {
  /** Distinct independent publisher groups. */
  independentPublishers: number;
  /** Total publisher groups before syndication folding. */
  totalGroups: number;
  /** Number of syndicated/near-identical groups folded into others. */
  syndicatedGroups: number;
  /** Diversity contribution 0..1 (saturates at 3 independent publishers). */
  diversityScore: number;
  detail: {
    groups: Array<{ key: string; label: string; itemCount: number; syndicated: boolean }>;
    evidence: string[];
  };
};

/** Normalize a publisher domain into a stable group key. Mirror hosts under
 *  the same registrable family collapse to one publisher. */
export function publisherGroupKey(domain: string | null | undefined): string | null {
  if (!domain) {
    return null;
  }
  const clean = domain
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/^m\./, "")
    .replace(/^amp\./, "")
    .replace(/\.(feeds?|rss|news)\./, ".");
  const parts = clean.split(".").filter(Boolean);
  if (parts.length <= 2) {
    return clean;
  }
  return parts.slice(-2).join(".");
}

/** Conservative near-duplicate detector (deterministic, no embeddings):
 *  only identical content proves a copy. The same headline from a different
 *  publisher is CORROBORATION, never syndication — treating it as a copy
 *  would silently erase independent confirmation. */
export function isNearIdenticalContent(a: DiversityInput, b: DiversityInput): boolean {
  return a.contentHash === b.contentHash;
}

/** Compute the diversity of a cluster's members. Members whose content is
 *  identical to a member of another group fold into that group (they are
 *  mirrored copies, not independent confirmation). */
export function computeSourceDiversity(members: DiversityInput[]): DiversityResult {
  const groups = new Map<string, { label: string; itemIds: string[]; inputs: DiversityInput[] }>();

  for (const member of members) {
    const key = publisherGroupKey(member.sourceDomain) ?? member.sourceName?.toLowerCase().trim() ?? "unknown";
    const label = member.sourceDomain || member.sourceName || "unknown";
    let group = groups.get(key);
    if (!group) {
      group = { label, itemIds: [], inputs: [] };
      groups.set(key, group);
    }
    group.itemIds.push(member.itemId);
    group.inputs.push(member);
  }

  const entries = Array.from(groups.entries());
  const syndicated = new Set<string>();
  const evidence: string[] = [];

  // Fold mirror copies: if the majority of group B's content is identical to
  // content in group A, B is a mirror of A.
  for (let left = 0; left < entries.length; left += 1) {
    const [leftKey, leftGroup] = entries[left];
    if (syndicated.has(leftKey)) {
      continue;
    }
    for (let right = left + 1; right < entries.length; right += 1) {
      const [rightKey, rightGroup] = entries[right];
      if (syndicated.has(rightKey)) {
        continue;
      }
      const copiedRatio =
        rightGroup.inputs.filter((rightInput) =>
          leftGroup.inputs.some((leftInput) => isNearIdenticalContent(rightInput, leftInput)),
        ).length / Math.max(1, rightGroup.inputs.length);
      if (copiedRatio >= 0.5) {
        syndicated.add(rightKey);
        evidence.push(`syndicated:${rightGroup.label}~${leftGroup.label}`);
      }
    }
  }

  const independent = entries.filter(([key]) => !syndicated.has(key));
  const independentCount = independent.length;
  const diversityScore = Math.min(1, independentCount / 3);

  return {
    independentPublishers: independentCount,
    totalGroups: entries.length,
    syndicatedGroups: syndicated.size,
    diversityScore: Math.round(diversityScore * 100) / 100,
    detail: {
      groups: entries.map(([key, group]) => ({
        key,
        label: group.label,
        itemCount: group.itemIds.length,
        syndicated: syndicated.has(key),
      })),
      evidence,
    },
  };
}
