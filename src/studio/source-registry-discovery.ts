// Site-scoped source discovery and lifecycle.
//
// Discovery inspects the destination's own feeds (first party) and external
// candidates derived from the site's detected topics (curated source packs and,
// when configured, the web search provider). Every candidate is fetched and
// parsed through the SSRF-guarded source HTTP client before it is called
// "verified". Nothing is subscribed automatically: recommendations are
// reviewed by an operator, and accepting one creates a ContentSource that
// keeps the recommendation's provenance.

import { randomUUID } from "node:crypto";
import { Prisma, type ContentSource, type ContentSourceType } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { writeAudit } from "./audit";
import { discoverFeedsForUrl, verifyFeedCandidate, type FeedSampleItem } from "./feed-discovery";
import { normalizeCanonicalUrl } from "./adapters/normalize";
import { getSourceAdapter } from "./adapters/registry";
import { newRunKey } from "./discovery-run";
import { computeSourceUiHealth, listPackCatalog } from "./source-registry";
import { sanitizeSourceForClient, updateSource } from "./sources";
import { loadBlockedDomainSet } from "./source-quality";
import { getWebIntelligenceProvider } from "./web-intelligence";
import { recordWebUsage } from "./web-discovery";
import { registerOnboardingStep } from "./onboarding/contracts";
import { completeOperation, createOperation, failOperation, recordAuditForOperation, startOperation } from "./operations";

const prisma = getPrismaClient();

/** Shown wherever a source is accepted or ingested. */
export const REPUBLICATION_NOTICE =
  "Ingestion permission is not republication permission: items are used as evidence and attribution, never copied as published content.";

// ────────────────────────────────────────────────────────────── Topic vocabulary

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "your", "you", "are", "was", "how", "what", "why", "who", "new", "news",
  "los", "las", "del", "que", "con", "por", "para", "una", "uno", "como", "mas", "sus", "sobre", "entre", "este", "esta",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

export type TopicTerm = { name: string; terms: string[] };

function hasToken(tokens: Set<string>, part: string): boolean {
  return tokens.has(part) || tokens.has(`${part}s`) || (part.endsWith("s") && tokens.has(part.slice(0, -1)));
}

/** Topics of `vocabulary` whose terms all appear in `text`. Pure. */
export function classifyTopics(text: string, vocabulary: TopicTerm[]): string[] {
  const tokens = new Set(tokenize(text));
  return vocabulary
    .filter((topic) => topic.terms.some((term) => term.split(" ").every((part) => hasToken(tokens, part))))
    .map((topic) => topic.name);
}

function asStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/** Read-only view of the site's topic vocabulary (clusters + profile topics). */
export async function loadSiteTopicVocabulary(tenantId: string, siteId: string): Promise<TopicTerm[]> {
  const [clusters, profile] = await Promise.all([
    prisma.siteTopicCluster.findMany({ where: { tenantId, siteId }, orderBy: { pagesCount: "desc" }, take: 40 }),
    prisma.siteIntelligenceProfile.findFirst({ where: { tenantId, siteId }, select: { mainTopics: true } }),
  ]);
  const byName = new Map<string, Set<string>>();
  const add = (name: string, phrases: string[]) => {
    const key = name.trim();
    if (!key) return;
    const terms = byName.get(key) ?? new Set<string>();
    for (const phrase of [key, ...phrases]) {
      const tokens = tokenize(phrase);
      if (tokens.length) terms.add(tokens.join(" "));
    }
    if (terms.size) byName.set(key, terms);
  };
  for (const cluster of clusters) add(cluster.name, asStringArray(cluster.keywords).slice(0, 12));
  for (const topic of asStringArray(profile?.mainTopics).slice(0, 20)) add(topic, []);
  return Array.from(byName.entries()).map(([name, terms]) => ({ name, terms: Array.from(terms) }));
}

// ────────────────────────────────────────────────────────────── Discovery

type Candidate = {
  url: string;
  canonicalUrl: string;
  domain: string;
  name: string;
  type: string;
  category: string | null;
  relationship: "first_party" | "external";
  discoveryMethod: string;
  language: string | null;
  geography: string | null;
  packTrust: number | null;
  seedTopics: string[];
  limitations: string[];
};

export type SourceDiscoveryResult = {
  siteId: string;
  candidates: number;
  created: number;
  updated: number;
  verified: number;
  failed: number;
  firstParty: number;
  external: number;
  skipped: string[];
  errors: string[];
};

const FEED_TYPES = new Set(["rss", "atom", "news_sitemap"]);

function siteCountry(locale: string): string | null {
  const match = /[-_]([A-Za-z]{2})$/.exec(locale);
  return match ? match[1].toUpperCase() : null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function freshnessFromSample(sample: FeedSampleItem[] | undefined, now: Date): string {
  const newest = (sample ?? [])
    .map((item) => (item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN))
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)[0];
  if (newest === undefined) return "unknown";
  const ageHours = (now.getTime() - newest) / 3_600_000;
  if (ageHours <= 24) return "daily";
  if (ageHours <= 24 * 7) return "weekly";
  if (ageHours <= 24 * 31) return "monthly";
  return "stale";
}

function trustLevel(candidate: Candidate): "high" | "medium" | "low" | "unassessed" {
  if (candidate.relationship === "first_party") return "high";
  if (candidate.packTrust === null) return "unassessed";
  return candidate.packTrust >= 0.8 ? "high" : candidate.packTrust >= 0.6 ? "medium" : "low";
}

async function collectExternalCandidates(
  tenantId: string,
  site: { id: string; locale: string; baseUrl: string | null },
  vocabulary: TopicTerm[],
  blocked: Set<string>,
  siteHost: string,
  result: SourceDiscoveryResult,
): Promise<Candidate[]> {
  const language = site.locale.slice(0, 2).toLowerCase();
  const out: Candidate[] = [];
  // 1. Curated pack entries whose own category/tags overlap the site's topics.
  for (const pack of listPackCatalog()) {
    for (const entry of pack.entries) {
      const host = entry.domain.replace(/^www\./, "");
      if (host === siteHost || blocked.has(host)) continue;
      const overlap = classifyTopics([entry.category, ...entry.tags, entry.name].join(" "), vocabulary);
      if (overlap.length === 0) continue;
      const canonicalUrl = normalizeCanonicalUrl(entry.endpoint);
      if (!canonicalUrl) continue;
      out.push({
        url: entry.endpoint,
        canonicalUrl,
        domain: host,
        name: entry.name,
        type: entry.adapter === "sitemap" ? (/news/i.test(entry.endpoint) ? "news_sitemap" : "sitemap") : entry.adapter,
        category: entry.category,
        relationship: "external",
        discoveryMethod: `source_pack:${pack.key}`,
        language: entry.language,
        geography: entry.country,
        packTrust: entry.trust,
        seedTopics: overlap,
        limitations: [
          ...(entry.language !== language ? [`Language ${entry.language} differs from the site language ${language}`] : []),
          ...(entry.restrictions ? [entry.restrictions] : []),
        ],
      });
    }
  }

  // 2. Web search for the site's main topics, only when a provider is configured.
  const provider = getWebIntelligenceProvider();
  if (!provider) {
    result.skipped.push("web_search_provider_not_configured");
    return out;
  }
  const domains = new Map<string, string[]>();
  for (const topic of vocabulary.slice(0, 2)) {
    try {
      const results = await provider.search(`${topic.name} news`, { limit: 6, language, country: siteCountry(site.locale) });
      await recordWebUsage({ tenantId, siteId: site.id, provider: provider.name, operation: "search", queries: 1 });
      for (const hit of results) {
        const host = (hit.domain || hostOf(hit.url) || "").replace(/^www\./, "");
        if (!host || host === siteHost || blocked.has(host)) continue;
        domains.set(host, [...(domains.get(host) ?? []), topic.name]);
      }
    } catch (error) {
      result.errors.push(`search(${topic.name}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const [host, topics] of Array.from(domains.entries()).slice(0, 4)) {
    const discovered = await discoverFeedsForUrl({ url: `https://${host}` });
    const feed = discovered.candidates.find((candidate) => candidate.verified && FEED_TYPES.has(candidate.type));
    const canonicalUrl = feed ? normalizeCanonicalUrl(feed.url) : null;
    if (!feed || !canonicalUrl) continue;
    out.push({
      url: feed.url,
      canonicalUrl,
      domain: host,
      name: feed.title ?? host,
      type: feed.type,
      category: null,
      relationship: "external",
      discoveryMethod: `web_search:${provider.name}`,
      language: null,
      geography: null,
      packTrust: null,
      seedTopics: Array.from(new Set(topics)),
      limitations: ["Found through web search; trust has not been assessed by an editor yet"],
    });
  }
  return out;
}

/**
 * Discover, verify and persist source recommendations for one site.
 * Idempotent: rows are keyed by (tenant, site, canonical URL); re-runs refresh
 * verification and never override an operator's accept/reject decision.
 */
export async function discoverSourceRecommendations(tenantId: string, siteId: string): Promise<SourceDiscoveryResult> {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { id: true, locale: true, baseUrl: true, name: true } });
  if (!site) throw new Error("site_not_found");
  const result: SourceDiscoveryResult = { siteId, candidates: 0, created: 0, updated: 0, verified: 0, failed: 0, firstParty: 0, external: 0, skipped: [], errors: [] };
  const siteHost = site.baseUrl ? hostOf(site.baseUrl) : null;
  if (!site.baseUrl || !siteHost) {
    result.skipped.push("site_without_base_url");
    return result;
  }
  const [vocabulary, blocked] = await Promise.all([loadSiteTopicVocabulary(tenantId, siteId), loadBlockedDomainSet(tenantId)]);
  const language = site.locale.slice(0, 2).toLowerCase();
  const candidates = new Map<string, Candidate>();

  // First-party feeds declared or exposed by the destination itself.
  const own = await discoverFeedsForUrl({ url: site.baseUrl });
  result.errors.push(...own.errors);
  for (const found of own.candidates) {
    if (!FEED_TYPES.has(found.type) || (!found.verified && found.method !== "link_alternate")) continue;
    const canonicalUrl = normalizeCanonicalUrl(found.url);
    if (!canonicalUrl || candidates.has(canonicalUrl)) continue;
    candidates.set(canonicalUrl, {
      url: found.url,
      canonicalUrl,
      domain: siteHost,
      name: found.title ? `${site.name} · ${found.title}` : `${site.name} · ${found.type === "news_sitemap" ? "news sitemap" : "feed"}`,
      type: found.type,
      category: "first_party",
      relationship: "first_party",
      discoveryMethod: `feed_discovery:${found.method}`,
      language,
      geography: siteCountry(site.locale),
      packTrust: null,
      seedTopics: [],
      limitations: found.type === "news_sitemap" ? ["News sitemaps usually list only the last 48 hours of articles"] : [],
    });
  }
  if (vocabulary.length === 0) {
    result.skipped.push("site_topics_not_detected");
  } else {
    for (const candidate of await collectExternalCandidates(tenantId, site, vocabulary, blocked, siteHost, result)) {
      if (!candidates.has(candidate.canonicalUrl)) candidates.set(candidate.canonicalUrl, candidate);
    }
  }

  result.candidates = candidates.size;
  const now = new Date();
  for (const candidate of candidates.values()) {
    const check = await verifyFeedCandidate(candidate.url, { sampleSize: 8 });
    const sample = check.sample ?? [];
    const topics = Array.from(new Set([...candidate.seedTopics, ...classifyTopics(sample.map((item) => item.title).join(" \n "), vocabulary)]));
    const trust = trustLevel(candidate);
    const relevance = candidate.relationship === "first_party" ? "high" : topics.length >= 2 ? "high" : topics.length === 1 ? "medium" : "low";
    const freshness = check.verified ? freshnessFromSample(sample, now) : "unknown";
    const limitations = [...candidate.limitations, REPUBLICATION_NOTICE];
    if (check.verified && check.itemCount === 0) limitations.push("The endpoint parsed but returned no items");
    if (freshness === "stale") limitations.push("The newest item is older than a month");
    const reason =
      candidate.relationship === "first_party"
        ? `Feed published by ${site.name} itself (${candidate.discoveryMethod.replace("feed_discovery:", "")}); tracks your own new articles.`
        : `${candidate.discoveryMethod.startsWith("source_pack") ? "Curated source pack entry" : "Web search result"} matching site topics: ${topics.join(", ") || "none measured"}.`;
    const assessment = [
      `Trust ${trust}${candidate.packTrust !== null ? ` (pack trust ${candidate.packTrust})` : ""}.`,
      `Relevance ${relevance}: ${topics.length} topic match(es) against the site vocabulary.`,
      check.verified ? `Verified: HTTP ${check.status ?? "?"}, ${check.itemCount ?? 0} item(s) parsed.` : `Not verified: ${check.note ?? "unknown error"}.`,
    ].join(" ");
    const data = {
      name: candidate.name.slice(0, 200),
      url: candidate.url,
      type: check.type && check.type !== "feed" ? check.type : candidate.type,
      category: candidate.category,
      relationship: candidate.relationship,
      topics: topics as Prisma.InputJsonValue,
      trustLevel: trust,
      relevance,
      assessmentReason: assessment,
      reasonSummary: reason.slice(0, 1000),
      language: candidate.language,
      geography: candidate.geography,
      verificationStatus: check.verified ? "verified" : "failed",
      lastCheckedAt: now,
      lastSeenAt: now,
      expectedFreshness: freshness,
      limitations: limitations as Prisma.InputJsonValue,
      discoveryMethod: candidate.discoveryMethod,
      evidence: { httpStatus: check.status, itemCount: check.itemCount, note: check.note, sample: sample.slice(0, 5) } as Prisma.InputJsonValue,
      score: (relevance === "high" ? 60 : relevance === "medium" ? 40 : 15) + (trust === "high" ? 30 : trust === "medium" ? 20 : 5) + (check.verified ? 10 : 0),
    };
    const existing = await prisma.sourceRecommendation.findFirst({ where: { tenantId, siteId, canonicalUrl: candidate.canonicalUrl } });
    if (existing) {
      await prisma.sourceRecommendation.update({ where: { id: existing.id }, data });
      result.updated += 1;
    } else {
      await prisma.sourceRecommendation.create({ data: { ...data, tenantId, siteId, domain: candidate.domain, canonicalUrl: candidate.canonicalUrl, status: "open" } });
      result.created += 1;
    }
    if (check.verified) result.verified += 1;
    else result.failed += 1;
    if (candidate.relationship === "first_party") result.firstParty += 1;
    else result.external += 1;
  }
  await writeAudit({ tenantId, actorType: "automation", action: "sources.discovered", entityType: "site", entityId: siteId, metadata: { ...result, errors: result.errors.slice(0, 5) } });
  return result;
}

registerOnboardingStep("sources", async ({ tenantId, siteId }) => {
  const result = await discoverSourceRecommendations(tenantId, siteId);
  const skipped = result.skipped.length ? ` Skipped: ${result.skipped.join(", ")}.` : "";
  return {
    summary: `Found ${result.candidates} source candidate(s): ${result.firstParty} first-party, ${result.external} external; ${result.verified} verified, ${result.failed} failed verification. Review them in Sources.${skipped}`,
    counts: { candidates: result.candidates, verified: result.verified, failed: result.failed, firstParty: result.firstParty, external: result.external, created: result.created },
  };
});

// ────────────────────────────────────────────────────────────── Recommendations review

async function requireSite(tenantId: string, siteId: string) {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { id: true, key: true, name: true, locale: true } });
  if (!site) throw new Error("site_not_found");
  return site;
}

export async function listSiteSourceRecommendations(tenantId: string, siteId: string, filters: { status?: string; relationship?: string } = {}) {
  await requireSite(tenantId, siteId);
  return prisma.sourceRecommendation.findMany({
    where: {
      tenantId,
      siteId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.relationship ? { relationship: filters.relationship } : {}),
    },
    orderBy: [{ status: "asc" }, { score: "desc" }, { name: "asc" }],
    take: 200,
  });
}

const TRUST_SCORES: Record<string, number> = { high: 0.85, medium: 0.6, low: 0.35, unassessed: 0.5 };

function adapterTypeFor(type: string | null): ContentSourceType {
  if (type === "atom") return "atom";
  if (type === "sitemap" || type === "news_sitemap") return "sitemap";
  return "rss";
}

async function uniqueSourceName(tenantId: string, base: string, siteKey: string): Promise<string> {
  for (const name of [base, `${base} (${siteKey})`, `${base} (${siteKey}) ${Date.now().toString(36)}`]) {
    if (!(await prisma.contentSource.findFirst({ where: { tenantId, name }, select: { id: true } }))) return name;
  }
  return `${base} ${randomUUID().slice(0, 8)}`;
}

/** Accept: create (or reactivate) a ContentSource for the site with provenance. */
export async function acceptSiteSourceRecommendation(tenantId: string, siteId: string, recommendationId: string, userId: string | null) {
  const site = await requireSite(tenantId, siteId);
  const recommendation = await prisma.sourceRecommendation.findFirst({ where: { id: recommendationId, tenantId, siteId } });
  if (!recommendation || !recommendation.url) throw new Error("recommendation_not_found");
  let source = recommendation.sourceId ? await prisma.contentSource.findFirst({ where: { id: recommendation.sourceId, tenantId } }) : null;
  source ??= await prisma.contentSource.findFirst({ where: { tenantId, siteId, url: recommendation.url } });
  const provenance = {
    recommendationId: recommendation.id,
    relationship: recommendation.relationship,
    discoveryMethod: recommendation.discoveryMethod,
    reason: recommendation.reasonSummary,
    assessment: recommendation.assessmentReason,
    acceptedAt: new Date().toISOString(),
    acceptedBy: userId,
  };
  if (source) {
    const configuration = { ...((source.configuration as Record<string, unknown> | null) ?? {}), provenance };
    source = await prisma.contentSource.update({ where: { id: source.id }, data: { enabled: true, archivedAt: null, siteId, configuration: configuration as Prisma.InputJsonObject } });
  } else {
    source = await prisma.contentSource.create({
      data: {
        tenantId,
        siteId,
        name: await uniqueSourceName(tenantId, recommendation.name ?? recommendation.domain, site.key),
        type: adapterTypeFor(recommendation.type),
        url: recommendation.url,
        domain: recommendation.domain,
        enabled: true,
        trustScore: TRUST_SCORES[recommendation.trustLevel ?? "unassessed"] ?? 0.5,
        language: recommendation.language ?? site.locale.slice(0, 2),
        country: recommendation.geography,
        categories: (recommendation.topics ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        refreshIntervalMinutes: recommendation.expectedFreshness === "daily" ? 30 : recommendation.expectedFreshness === "weekly" ? 180 : 720,
        robotsPolicy: { respect: true },
        copyrightPolicy: { republication: "not_granted", usage: "evidence_and_attribution" },
        configuration: { provenance } as Prisma.InputJsonObject,
        discoveryMethod: recommendation.discoveryMethod,
        verificationStatus: recommendation.verificationStatus === "verified" ? "verified" : "unverified",
        verifiedAt: recommendation.verificationStatus === "verified" ? recommendation.lastCheckedAt : null,
        restrictionsNote: REPUBLICATION_NOTICE,
      },
    });
  }
  await prisma.sourceRecommendation.update({ where: { id: recommendation.id }, data: { status: "accepted", sourceId: source.id } });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "source.recommendation.accepted", entityType: "content_source", entityId: source.id, metadata: { recommendationId, siteId } });
  return sanitizeSourceForClient(source);
}

export async function rejectSiteSourceRecommendation(tenantId: string, siteId: string, recommendationId: string, userId: string | null) {
  const updated = await prisma.sourceRecommendation.updateMany({ where: { id: recommendationId, tenantId, siteId }, data: { status: "rejected" } });
  if (updated.count === 0) throw new Error("recommendation_not_found");
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "source.recommendation.rejected", entityType: "source_recommendation", entityId: recommendationId, metadata: { siteId } });
  return { ok: true };
}

/** Add a source manually: verified through the same guarded fetch, then created active. */
export async function addManualSiteSource(
  tenantId: string,
  siteId: string,
  input: { url: string; name?: string | null; topics?: string[]; language?: string | null },
  userId: string | null,
) {
  const site = await requireSite(tenantId, siteId);
  const canonicalUrl = normalizeCanonicalUrl(input.url);
  if (!canonicalUrl) throw new Error("invalid_url");
  const check = await verifyFeedCandidate(canonicalUrl, { sampleSize: 5 });
  if (!check.verified) throw new Error(`verification_failed: ${check.note ?? "unknown"}`);
  const domain = hostOf(canonicalUrl) ?? "";
  const existing = await prisma.sourceRecommendation.findFirst({ where: { tenantId, siteId, canonicalUrl } });
  const recommendation =
    existing ??
    (await prisma.sourceRecommendation.create({
      data: {
        tenantId,
        siteId,
        domain,
        canonicalUrl,
        url: canonicalUrl,
        name: input.name?.trim() || domain,
        type: check.type ?? "rss",
        relationship: domain === hostOf((await prisma.site.findUnique({ where: { id: site.id }, select: { baseUrl: true } }))?.baseUrl ?? "") ? "first_party" : "external",
        topics: (input.topics ?? []) as Prisma.InputJsonValue,
        trustLevel: "unassessed",
        relevance: "manual",
        assessmentReason: `Added manually by an editor. Verified: HTTP ${check.status ?? "?"}, ${check.itemCount ?? 0} item(s).`,
        reasonSummary: "Added manually",
        language: input.language ?? site.locale.slice(0, 2),
        verificationStatus: "verified",
        lastCheckedAt: new Date(),
        limitations: [REPUBLICATION_NOTICE] as Prisma.InputJsonValue,
        discoveryMethod: "manual",
        evidence: { httpStatus: check.status, itemCount: check.itemCount, sample: check.sample ?? [] } as Prisma.InputJsonValue,
        score: 50,
        status: "open",
      },
    }));
  return acceptSiteSourceRecommendation(tenantId, siteId, recommendation.id, userId);
}

// ────────────────────────────────────────────────────────────── Source lifecycle

export type SourceLifecycleState = "active" | "paused" | "archived";

export function sourceLifecycleState(source: Pick<ContentSource, "enabled" | "archivedAt">): SourceLifecycleState {
  return source.archivedAt ? "archived" : source.enabled ? "active" : "paused";
}

export async function listSiteSources(tenantId: string, siteId: string, filters: { state?: string; search?: string } = {}) {
  await requireSite(tenantId, siteId);
  const sources = await prisma.contentSource.findMany({
    where: {
      tenantId,
      siteId,
      ...(filters.search ? { OR: [{ name: { contains: filters.search, mode: "insensitive" } }, { url: { contains: filters.search, mode: "insensitive" } }] } : {}),
    },
    include: { health: true, _count: { select: { items: true } } },
    orderBy: [{ priority: "desc" }, { name: "asc" }],
    take: 300,
  });
  return sources
    .map((source) => {
      const state = sourceLifecycleState(source);
      const ui = computeSourceUiHealth({
        enabled: source.enabled,
        archivedAt: source.archivedAt,
        healthStatus: source.health?.healthStatus ?? "unknown",
        circuitState: source.health?.circuitState ?? "closed",
        lastFetchedAt: source.lastFetchedAt,
        lastSuccessAt: source.lastSuccessAt,
        refreshIntervalMinutes: source.refreshIntervalMinutes,
        rateLimitEvents: source.health?.rateLimitEvents ?? 0,
        consecutiveFailures: source.consecutiveFailures,
        lastError: source.lastError,
      });
      const { _count, ...rest } = source;
      return { ...sanitizeSourceForClient(rest), state, uiHealth: ui, itemsCount: _count.items };
    })
    .filter((source) => !filters.state || source.state === filters.state);
}

async function requireSiteSource(tenantId: string, siteId: string, sourceId: string) {
  const source = await prisma.contentSource.findFirst({ where: { id: sourceId, tenantId, siteId } });
  if (!source) throw new Error("source_not_found");
  return source;
}

export type SourceConfigPatch = {
  url?: string;
  refreshIntervalMinutes?: number;
  language?: string;
  priority?: number;
  trustLevel?: "high" | "medium" | "low";
  topics?: string[];
  pillars?: string[];
  relevanceKeywords?: string[];
  selectors?: Record<string, string>;
};

/** Edit extraction/ingestion configuration, preserving provenance. */
export async function updateSiteSourceConfig(tenantId: string, siteId: string, sourceId: string, patch: SourceConfigPatch) {
  const source = await requireSiteSource(tenantId, siteId, sourceId);
  let url: string | undefined;
  if (patch.url !== undefined) {
    const normalized = normalizeCanonicalUrl(patch.url);
    if (!normalized) throw new Error("invalid_url");
    url = normalized;
  }
  if (patch.refreshIntervalMinutes !== undefined && !(Number.isInteger(patch.refreshIntervalMinutes) && patch.refreshIntervalMinutes >= 5 && patch.refreshIntervalMinutes <= 10_080)) {
    throw new Error("refreshIntervalMinutes must be an integer between 5 and 10080");
  }
  if (patch.trustLevel !== undefined && !(patch.trustLevel in TRUST_SCORES)) throw new Error("invalid trustLevel");
  const clean = (list: string[] | undefined) => (list === undefined ? undefined : Array.from(new Set(list.map((entry) => String(entry).trim()).filter(Boolean))).slice(0, 40));
  const configuration = { ...((source.configuration as Record<string, unknown> | null) ?? {}) };
  if (patch.pillars !== undefined) configuration.pillars = clean(patch.pillars);
  if (patch.relevanceKeywords !== undefined) configuration.relevanceKeywords = clean(patch.relevanceKeywords);
  if (patch.selectors !== undefined) {
    configuration.selectors = Object.fromEntries(Object.entries(patch.selectors ?? {}).filter(([, value]) => typeof value === "string" && value.trim()).map(([key, value]) => [key, value.trim()]));
  }
  const updated = await updateSource(tenantId, sourceId, {
    url,
    domain: url ? hostOf(url) : undefined,
    refreshIntervalMinutes: patch.refreshIntervalMinutes,
    language: patch.language?.trim() || undefined,
    priority: patch.priority === undefined ? undefined : Math.max(-10, Math.min(100, Math.round(patch.priority))),
    trustScore: patch.trustLevel ? TRUST_SCORES[patch.trustLevel] : undefined,
    categories: clean(patch.topics),
    configuration,
    // A changed endpoint must be re-verified before it counts as evidence.
    verificationStatus: url && url !== source.url ? "unverified" : undefined,
  });
  return updated ? sanitizeSourceForClient(updated) : null;
}

export async function setSiteSourceState(tenantId: string, siteId: string, sourceId: string, action: "pause" | "resume" | "archive" | "restore", userId: string | null) {
  const source = await requireSiteSource(tenantId, siteId, sourceId);
  if (action === "resume" && source.archivedAt) throw new Error("source_archived_restore_first");
  const data =
    action === "pause" ? { enabled: false } : action === "resume" ? { enabled: true } : action === "archive" ? { enabled: false, archivedAt: new Date() } : { archivedAt: null, enabled: false };
  // Items, runs and provenance are kept: archive is a state, never a delete.
  const updated = await prisma.contentSource.update({ where: { id: source.id }, data });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: `source.${action}`, entityType: "content_source", entityId: source.id, metadata: { siteId } });
  return { id: updated.id, state: sourceLifecycleState(updated) };
}

/** Run a real extraction now (no persistence of items) and record the verification outcome. */
export async function testSiteSource(tenantId: string, siteId: string, sourceId: string) {
  const source = await requireSiteSource(tenantId, siteId, sourceId);
  const started = Date.now();
  try {
    const items = await getSourceAdapter(source.type).discover(source, { runId: newRunKey("test"), tenantId, limits: {} });
    await prisma.contentSource.update({ where: { id: source.id }, data: { verificationStatus: "verified", verifiedAt: new Date(), lastError: null, lastErrorAt: null } });
    return {
      ok: true,
      latencyMs: Date.now() - started,
      itemCount: items.length,
      items: items.slice(0, 10).map((item) => ({ title: item.title, url: item.canonicalUrl ?? item.sourceUrl, publishedAt: item.publishedAt, categories: item.categories })),
      error: null as string | null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.contentSource.update({ where: { id: source.id }, data: { verificationStatus: "failed", lastError: message.slice(0, 500), lastErrorAt: new Date() } });
    return { ok: false, latencyMs: Date.now() - started, itemCount: 0, items: [], error: message };
  }
}

export async function listSiteSourceItems(tenantId: string, siteId: string, sourceId: string, limit = 50) {
  await requireSiteSource(tenantId, siteId, sourceId);
  return prisma.sourceItem.findMany({
    where: { tenantId, sourceId },
    orderBy: { discoveredAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
    select: { id: true, title: true, canonicalUrl: true, sourceUrl: true, publishedAt: true, discoveredAt: true, processingStatus: true, language: true, categories: true },
  });
}

export async function getSiteSourceDiagnostics(tenantId: string, siteId: string, sourceId: string) {
  const source = await requireSiteSource(tenantId, siteId, sourceId);
  const [health, runs, recommendation] = await Promise.all([
    prisma.sourceHealth.findFirst({ where: { tenantId, sourceId } }),
    prisma.discoveryRun.findMany({ where: { tenantId, sourceId }, orderBy: { startedAt: "desc" }, take: 15 }),
    prisma.sourceRecommendation.findFirst({ where: { tenantId, sourceId }, orderBy: { updatedAt: "desc" } }),
  ]);
  return {
    source: { ...sanitizeSourceForClient(source), state: sourceLifecycleState(source) },
    health,
    runs,
    provenance: (source.configuration as Record<string, unknown> | null)?.provenance ?? null,
    recommendation,
    notice: REPUBLICATION_NOTICE,
  };
}

// ────────────────────────────────────────────────────────────── Planning evidence

export type PlanningSourceEvidence = { title: string; url: string; sourceName: string; publishedAt: string | null; topics: string[] };

/**
 * Recent, relevant items from ACTIVE, verified sources of the site (paused and
 * archived sources are excluded). When the site has a topic vocabulary (or the
 * source has relevance keywords) only matching items are returned.
 */
export async function getSourceEvidenceForPlanning(tenantId: string, siteId: string, limit = 20): Promise<PlanningSourceEvidence[]> {
  const sources = await prisma.contentSource.findMany({
    where: { tenantId, siteId, enabled: true, archivedAt: null, OR: [{ verificationStatus: "verified" }, { lastSuccessAt: { not: null } }] },
    select: { id: true, name: true, configuration: true },
  });
  if (sources.length === 0) return [];
  const vocabulary = await loadSiteTopicVocabulary(tenantId, siteId);
  const since = new Date(Date.now() - 30 * 24 * 3_600_000);
  const items = await prisma.sourceItem.findMany({
    where: {
      tenantId,
      sourceId: { in: sources.map((source) => source.id) },
      processingStatus: { notIn: ["duplicate", "rejected", "failed"] },
      OR: [{ publishedAt: { gte: since } }, { publishedAt: null, discoveredAt: { gte: since } }],
    },
    orderBy: [{ publishedAt: "desc" }, { discoveredAt: "desc" }],
    take: 400,
    select: { title: true, canonicalUrl: true, sourceUrl: true, publishedAt: true, categories: true, description: true, sourceId: true },
  });
  const byId = new Map(sources.map((source) => [source.id, source]));
  const out: PlanningSourceEvidence[] = [];
  for (const item of items) {
    const url = item.canonicalUrl ?? item.sourceUrl;
    const source = byId.get(item.sourceId);
    if (!url || !source) continue;
    const text = [item.title, item.description ?? "", ...asStringArray(item.categories)].join(" ");
    const keywords = asStringArray((source.configuration as Record<string, Prisma.JsonValue> | null)?.relevanceKeywords ?? null);
    const keywordVocabulary = keywords.map((keyword) => ({ name: keyword, terms: [tokenize(keyword).join(" ")].filter(Boolean) }));
    const topics = Array.from(new Set([...classifyTopics(text, vocabulary), ...classifyTopics(text, keywordVocabulary)]));
    if ((vocabulary.length > 0 || keywordVocabulary.length > 0) && topics.length === 0) continue;
    out.push({ title: item.title, url, sourceName: source.name, publishedAt: item.publishedAt?.toISOString() ?? null, topics });
    if (out.length >= limit) break;
  }
  return out;
}

// ────────────────────────────────────────────────────────────── Background runs

/** Run `work` detached from the request, tracked as a durable Operation. */
export async function runAsOperation(
  input: { tenantId: string; siteId: string; type: string; userId: string | null; entityType: string },
  work: () => Promise<object>,
): Promise<{ operationId: string }> {
  const operation = await createOperation({ tenantId: input.tenantId, siteId: input.siteId, type: input.type, initiatorUserId: input.userId, entityType: input.entityType, entityId: input.siteId, totalSteps: 1 });
  setImmediate(async () => {
    try {
      await startOperation(operation.id, "running");
      const outcome = await work();
      await recordAuditForOperation(operation.id, `${input.type}.completed`, outcome as Record<string, unknown>);
      await completeOperation(operation.id, { phase: "done" });
    } catch (error) {
      await failOperation(operation.id, { errorCode: "failed", errorSummary: (error instanceof Error ? error.message : String(error)).slice(0, 500), retryable: true }).catch(() => undefined);
    }
  });
  return { operationId: operation.id };
}
