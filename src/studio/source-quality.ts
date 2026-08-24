import { Prisma, type ContentSource } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { writeAudit } from "./audit";

const prisma = getPrismaClient();

export const QUALITY_TIERS = {
  TIER_1_PRIMARY: "TIER_1_PRIMARY",
  TIER_2_HIGH_AUTHORITY: "TIER_2_HIGH_AUTHORITY",
  TIER_3_SPECIALIST: "TIER_3_SPECIALIST",
  TIER_4_DISCOVERY_ONLY: "TIER_4_DISCOVERY_ONLY",
  BLOCKED: "BLOCKED",
} as const;

export type QualityTier = (typeof QUALITY_TIERS)[keyof typeof QUALITY_TIERS];

export type QualityDimensionKey =
  | "authority"
  | "relevance"
  | "primarySource"
  | "editorialQuality"
  | "recency"
  | "historicalReliability"
  | "originality"
  | "spamRisk"
  | "scrapeReliability"
  | "updateFrequency"
  | "topicCoverage"
  | "languageMatch"
  | "geographicMatch";

export type QualitySignals = {
  domain: string;
  tier: QualityTier;
  dimensions: Record<QualityDimensionKey, number>;
  score: number; // 0..100
  evidence: Record<string, unknown>;
};

const AUTHORITY_TLDS = new Set(["gov", "edu", "mil", "int"]);
const SPAMMY_TLDS = new Set(["info", "xyz", "top", "biz", "click", "loan", "win", "stream", "download"]);
const SPAM_PATTERNS = [/\d{4,}/, /(^|\.)www\d/, /\.(blogspot|wordpress|tumblr)\./];

const PRIMARY_HINTS = ["press.", "newsroom.", "sala-prensa.", "prensa.", "media-center.", ".go.es", ".gob.es", ".europa.eu", ".who.int"];

export function detectSpamSignals(domain: string): { spamRisk: number; reasons: string[] } {
  const reasons: string[] = [];
  let risk = 0;
  const parts = domain.split(".");
  const tld = parts[parts.length - 1] ?? "";
  if (SPAMMY_TLDS.has(tld)) {
    risk += 0.45;
    reasons.push(`spammy_tld_${tld}`);
  }
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(domain)) {
      risk += 0.3;
      reasons.push("spam_pattern");
      break;
    }
  }
  const hyphens = (domain.match(/-/g) ?? []).length;
  if (hyphens >= 3) {
    risk += 0.2;
    reasons.push("many_hyphens");
  }
  return { spamRisk: Math.min(1, risk), reasons };
}

function isPrimaryCandidate(domain: string, siteBaseHost: string | null): boolean {
  if (siteBaseHost && domain === siteBaseHost) {
    return true;
  }
  const parts = domain.split(".");
  const tld = parts[parts.length - 1] ?? "";
  if (AUTHORITY_TLDS.has(tld)) {
    return true;
  }
  return PRIMARY_HINTS.some((hint) => domain.startsWith(hint) || domain.includes(hint));
}

export type DomainEvaluationContext = {
  domain: string;
  tenantId: string;
  siteId?: string | null;
  topicKeywords: string[];
  language: string;
  blockedDomains: Set<string>;
  siteBaseHost: string | null;
  source?: Pick<ContentSource, "trustScore" | "consecutiveFailures" | "lastSuccessAt" | "lastFetchedAt" | "refreshIntervalMinutes" | "language" | "country"> | null;
  resultDescription?: string | null;
  publishedAt?: string | null;
  duplicateCount?: number;
};

export function evaluateDomainQuality(input: DomainEvaluationContext): QualitySignals {
  const domain = input.domain || "unknown";
  const spam = detectSpamSignals(domain);
  if (input.blockedDomains.has(domain) || spam.spamRisk >= 0.7) {
    return {
      domain,
      tier: QUALITY_TIERS.BLOCKED,
      dimensions: {
        authority: 0,
        relevance: 0,
        primarySource: 0,
        editorialQuality: 0,
        recency: 0,
        historicalReliability: 0,
        originality: 0,
        spamRisk: spam.spamRisk,
        scrapeReliability: 0,
        updateFrequency: 0,
        topicCoverage: 0,
        languageMatch: 0,
        geographicMatch: 0,
      },
      score: 0,
      evidence: { spam: spam.reasons },
    };
  }

  const parts = domain.split(".");
  const tld = parts[parts.length - 1] ?? "";
  const authority = AUTHORITY_TLDS.has(tld) ? 1 : tld === "org" ? 0.8 : tld === "com" ? 0.65 : tld === "es" ? 0.6 : 0.45;

  const primary = isPrimaryCandidate(domain, input.siteBaseHost) ? 1 : 0;

  const text = `${domain} ${input.resultDescription ?? ""}`.toLowerCase();
  const matchedTopics = input.topicKeywords.filter((keyword) => keyword && text.includes(keyword.toLowerCase())).length;
  const relevance = input.topicKeywords.length === 0 ? 0.5 : Math.min(1, matchedTopics / Math.max(3, Math.min(input.topicKeywords.length, 6)));

  const descriptionLength = String(input.resultDescription ?? "").length;
  const editorialQuality = Math.min(1, descriptionLength / 300);

  const publishedAt = input.publishedAt ? new Date(input.publishedAt).getTime() : null;
  const recency = !publishedAt || Number.isNaN(publishedAt)
    ? 0.5
    : Math.max(0, 1 - (Date.now() - publishedAt) / (14 * 24 * 3_600_000));

  const failures = input.source?.consecutiveFailures ?? 0;
  const historicalReliability = input.source ? Math.max(0.2, (input.source.trustScore ?? 0.5) * (1 - Math.min(0.6, failures * 0.15))) : 0.5;

  const duplicatePenalty = Math.min(0.5, (input.duplicateCount ?? 0) * 0.05);
  const originality = 1 - duplicatePenalty;

  const scrapeReliability = input.source
    ? failures === 0
      ? input.source.lastSuccessAt
        ? 0.9
        : 0.6
      : Math.max(0.1, 0.9 - failures * 0.2)
    : 0.5;

  const updateFrequency = input.source
    ? input.source.lastFetchedAt
      ? Math.max(0.3, 1 - (Date.now() - input.source.lastFetchedAt.getTime()) / (7 * 24 * 3_600_000))
      : 0.5
    : 0.5;

  const topicCoverage = relevance;

  const languageMatch = !input.source?.language || !input.language || input.source.language === input.language ? 1 : 0.4;

  const geographicMatch = input.source?.country ? 0.8 : 0.5;

  const dimensions: Record<QualityDimensionKey, number> = {
    authority,
    relevance,
    primarySource: primary,
    editorialQuality,
    recency,
    historicalReliability,
    originality,
    spamRisk: spam.spamRisk,
    scrapeReliability,
    updateFrequency,
    topicCoverage,
    languageMatch,
    geographicMatch,
  };

  const score = Math.round(
    100 *
      Math.max(
        0,
        Math.min(
          1,
          0.18 * authority +
            0.16 * relevance +
            0.12 * primary +
            0.1 * editorialQuality +
            0.1 * recency +
            0.08 * historicalReliability +
            0.06 * originality -
            0.25 * spam.spamRisk +
            0.08 * scrapeReliability +
            0.04 * updateFrequency +
            0.04 * topicCoverage +
            0.02 * languageMatch +
            0.02 * geographicMatch,
        ),
      ),
  );

  let tier: QualityTier;
  if (primary === 1 || score >= 85) {
    tier = QUALITY_TIERS.TIER_1_PRIMARY;
  } else if (score >= 70) {
    tier = QUALITY_TIERS.TIER_2_HIGH_AUTHORITY;
  } else if (score >= 50) {
    tier = QUALITY_TIERS.TIER_3_SPECIALIST;
  } else {
    tier = QUALITY_TIERS.TIER_4_DISCOVERY_ONLY;
  }

  return { domain, tier, dimensions, score, evidence: { spam: spam.reasons, matchedTopics } };
}

export async function saveSourceQualityProfile(tenantId: string, sourceId: string | null, quality: QualitySignals): Promise<void> {
  await prisma.sourceQualityProfile.create({
    data: {
      tenantId,
      sourceId,
      domain: quality.domain,
      dimensionsJson: quality.dimensions as unknown as Prisma.InputJsonValue,
      score: quality.score,
      tier: quality.tier,
      evidence: quality.evidence as unknown as Prisma.InputJsonObject,
      evaluatedAt: new Date(),
    },
  });
  if (sourceId) {
    await prisma.contentSource.update({
      where: { id: sourceId },
      data: { qualityScore: quality.score, qualityTier: quality.tier },
    });
  }
}

export async function upsertDiscoveredDomain(
  tenantId: string,
  domain: string,
  quality: QualitySignals,
): Promise<void> {
  await prisma.discoveredDomain.upsert({
    where: { tenantId_domain: { tenantId, domain } },
    create: {
      tenantId,
      domain,
      discoveryCount: 1,
      blocked: quality.tier === QUALITY_TIERS.BLOCKED,
      qualityScore: quality.score,
      tier: quality.tier,
      metadata: { evidence: quality.evidence } as Prisma.InputJsonObject,
    },
    update: {
      discoveryCount: { increment: 1 },
      lastSeenAt: new Date(),
      blocked: quality.tier === QUALITY_TIERS.BLOCKED,
      qualityScore: quality.score,
      tier: quality.tier,
    },
  });
}

export async function blockDomain(tenantId: string, domain: string, reason: string | null): Promise<void> {
  const normalized = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
  await prisma.blockedDomain.upsert({
    where: { tenantId_domain: { tenantId, domain: normalized } },
    create: { tenantId, domain: normalized, reason },
    update: { reason },
  });
  await prisma.discoveredDomain.updateMany({
    where: { tenantId, domain: normalized },
    data: { blocked: true },
  });
  // Disable any active source on that domain.
  const sources = await prisma.contentSource.findMany({
    where: { tenantId, enabled: true },
    select: { id: true, url: true },
  });
  const matching = sources.filter((source) => source.url && source.url.includes(normalized));
  if (matching.length > 0) {
    await prisma.contentSource.updateMany({
      where: { id: { in: matching.map((source) => source.id) } },
      data: { enabled: false },
    });
  }
  await writeAudit({
    tenantId,
    actorType: "user",
    action: "domain.blocked",
    entityType: "discovered_domain",
    entityId: null,
    metadata: { domain: normalized, reason },
  });
}

export async function unblockDomain(tenantId: string, domain: string): Promise<void> {
  const normalized = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
  await prisma.blockedDomain.deleteMany({ where: { tenantId, domain: normalized } });
  await prisma.discoveredDomain.updateMany({
    where: { tenantId, domain: normalized },
    data: { blocked: false },
  });
  await writeAudit({
    tenantId,
    actorType: "user",
    action: "domain.unblocked",
    entityType: "discovered_domain",
    entityId: null,
    metadata: { domain: normalized },
  });
}

export async function listBlockedDomains(tenantId: string) {
  return prisma.blockedDomain.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
}

export async function loadBlockedDomainSet(tenantId: string): Promise<Set<string>> {
  const blocked = await prisma.blockedDomain.findMany({ where: { tenantId }, select: { domain: true } });
  return new Set(blocked.map((entry) => entry.domain));
}

// ────────────────────────────────────────────────────────────── Recommendations

export async function recommendSource(input: {
  tenantId: string;
  domain: string;
  score: number;
  searchesCount: number;
  reasonSummary: string;
  autoEnable: boolean;
  minScore: number;
  language: string;
}): Promise<{ accepted: boolean; sourceId: string | null }> {
  const existing = await prisma.sourceRecommendation.findUnique({
    where: { tenantId_domain: { tenantId: input.tenantId, domain: input.domain } },
  });
  const recommendation = existing
    ? await prisma.sourceRecommendation.update({
        where: { id: existing.id },
        data: {
          score: input.score,
          searchesCount: input.searchesCount,
          reasonSummary: input.reasonSummary.slice(0, 1000),
          lastSeenAt: new Date(),
          ...(existing.status === "dismissed" ? {} : { status: input.autoEnable && input.score >= input.minScore ? "accepted" : "open" }),
        },
      })
    : await prisma.sourceRecommendation.create({
        data: {
          tenantId: input.tenantId,
          domain: input.domain,
          score: input.score,
          searchesCount: input.searchesCount,
          reasonSummary: input.reasonSummary.slice(0, 1000),
          status: input.autoEnable && input.score >= input.minScore ? "accepted" : "open",
        },
      });

  if (recommendation.status === "accepted" && !recommendation.sourceId) {
    const source = await prisma.contentSource.upsert({
      where: { tenantId_name: { tenantId: input.tenantId, name: input.domain } },
      create: {
        tenantId: input.tenantId,
        name: input.domain,
        type: "html",
        url: `https://${input.domain}`,
        enabled: true,
        priority: Math.max(0, Math.round(input.score / 20) - 2),
        trustScore: Math.round(input.score) / 100,
        language: input.language,
        qualityScore: input.score,
        qualityTier: null,
        lastDiscoveryAt: new Date(),
        configuration: { discoveredBy: "ai_web_discovery" } as Prisma.InputJsonObject,
      },
      update: {
        qualityScore: input.score,
        lastDiscoveryAt: new Date(),
        enabled: input.autoEnable ? true : undefined,
      },
    });
    await prisma.sourceRecommendation.update({
      where: { id: recommendation.id },
      data: { sourceId: source.id },
    });
    await writeAudit({
      tenantId: input.tenantId,
      actorType: "automation",
      action: "source.recommended.accepted",
      entityType: "content_source",
      entityId: source.id,
      metadata: { domain: input.domain, score: input.score },
    });
    return { accepted: true, sourceId: source.id };
  }

  return { accepted: false, sourceId: recommendation.sourceId };
}

export async function acceptSourceRecommendation(tenantId: string, recommendationId: string): Promise<{ sourceId: string } | null> {
  const recommendation = await prisma.sourceRecommendation.findFirst({ where: { id: recommendationId, tenantId } });
  if (!recommendation) {
    return null;
  }
  const source = await prisma.contentSource.upsert({
    where: { tenantId_name: { tenantId, name: recommendation.domain } },
    create: {
      tenantId,
      name: recommendation.domain,
      type: "html",
      url: `https://${recommendation.domain}`,
      enabled: true,
      priority: Math.max(0, Math.round(recommendation.score / 20) - 2),
      trustScore: Math.round(recommendation.score) / 100,
      language: "es",
      qualityScore: recommendation.score,
      lastDiscoveryAt: new Date(),
      configuration: { discoveredBy: "ai_web_discovery" } as Prisma.InputJsonObject,
    },
    update: { qualityScore: recommendation.score, enabled: true },
  });
  await prisma.sourceRecommendation.update({
    where: { id: recommendation.id },
    data: { status: "accepted", sourceId: source.id },
  });
  await writeAudit({
    tenantId,
    actorType: "user",
    action: "source.recommended.accepted",
    entityType: "content_source",
    entityId: source.id,
    metadata: { domain: recommendation.domain, score: recommendation.score },
  });
  return { sourceId: source.id };
}

export async function dismissSourceRecommendation(tenantId: string, recommendationId: string): Promise<boolean> {
  const recommendation = await prisma.sourceRecommendation.findFirst({ where: { id: recommendationId, tenantId } });
  if (!recommendation) {
    return false;
  }
  await prisma.sourceRecommendation.update({ where: { id: recommendation.id }, data: { status: "dismissed" } });
  return true;
}

export async function listSourceRecommendations(tenantId: string, input: { status?: string; page: number; pageSize: number }) {
  const skip = (input.page - 1) * input.pageSize;
  const where: Prisma.SourceRecommendationWhereInput = {
    tenantId,
    ...(input.status ? { status: input.status } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.sourceRecommendation.count({ where }),
    prisma.sourceRecommendation.findMany({
      where,
      orderBy: [{ score: "desc" }, { lastSeenAt: "desc" }],
      skip,
      take: input.pageSize,
    }),
  ]);
  return { items, page: input.page, pageSize: input.pageSize, total };
}

// ────────────────────────────────────────────────────────────── Learning feedback

export async function applySourceFeedback(
  tenantId: string,
  sourceId: string,
  signal: "accepted" | "rejected" | "published" | "blocked" | "scrape_failed",
): Promise<void> {
  const source = await prisma.contentSource.findFirst({ where: { id: sourceId, tenantId } });
  if (!source) {
    return;
  }
  const current = source.trustScore;
  const delta =
    signal === "published" ? 0.06 : signal === "accepted" ? 0.04 : signal === "rejected" ? -0.06 : signal === "scrape_failed" ? -0.04 : -0.2;
  const updated = Math.max(0, Math.min(1, Math.round((current + delta) * 1000) / 1000));
  await prisma.contentSource.update({
    where: { id: source.id },
    data: { trustScore: updated },
  });
  await writeAudit({
    tenantId,
    actorType: "automation",
    action: "source.feedback",
    entityType: "content_source",
    entityId: source.id,
    metadata: { signal, before: current, after: updated },
  });
}
