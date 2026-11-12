// Competitor intelligence for one destination site.
//
// The shortlist is built only from observable evidence (outbound links on the
// site's own pages, domain mentions in the indexed inventory, domains of the
// site's sources/recommendations, and web search results when a provider is
// configured). Coverage is sampled from public sitemaps/feeds — URLs and titles
// only, never bodies — through the SSRF-guarded, throttled source HTTP client
// with robots.txt respected. No traffic, volume or ranking figure is produced.

import { load } from "cheerio";
import { Prisma, type Competitor } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { validateScrapeUrl } from "../../infrastructure/scraping";
import { fetchSourceHttp, robotsAllows } from "../adapters/http";
import { writeAudit } from "../audit";
import { discoverFeedsForUrl, verifyFeedCandidate, type FeedSampleItem } from "../feed-discovery";
import { loadBlockedDomainSet } from "../source-quality";
import { classifyTopics, loadSiteTopicVocabulary, tokenize, type TopicTerm } from "../source-registry-discovery";
import { getWebIntelligenceProvider } from "../web-intelligence";
import { recordWebUsage } from "../web-discovery";
import { registerOnboardingStep } from "../onboarding/contracts";

const prisma = getPrismaClient();

export const COMPETITOR_STATUSES = ["suggested", "accepted", "rejected", "paused", "removed"] as const;
export type CompetitorStatus = (typeof COMPETITOR_STATUSES)[number];
export const OPPORTUNITY_KINDS = ["missing_topic", "improve_existing", "underdeveloped_cluster", "differentiated_angle", "cannibalization_risk"] as const;
export const OPPORTUNITY_STATUSES = ["open", "planned", "dismissed", "monitoring"] as const;

export type EvidenceEntry = { kind: string; url: string | null; note: string; observedAt: string };

// Platforms and infrastructure that are linked everywhere but are not editorial competitors.
const NON_COMPETITOR_DOMAINS = new Set([
  "facebook.com", "twitter.com", "x.com", "instagram.com", "youtube.com", "youtu.be", "tiktok.com", "linkedin.com", "pinterest.com",
  "whatsapp.com", "t.me", "telegram.org", "google.com", "goo.gl", "wikipedia.org", "wikimedia.org", "apple.com", "amazon.com",
  "wordpress.org", "wordpress.com", "w3.org", "schema.org", "gravatar.com", "github.com", "bit.ly", "t.co", "reddit.com", "spotify.com",
]);

export function registrableHost(value: string): string | null {
  try {
    const host = new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

function isCandidateHost(host: string | null, siteHost: string, blocked: Set<string>): host is string {
  if (!host || host === siteHost || host.endsWith(`.${siteHost}`) || blocked.has(host)) return false;
  const base = host.split(".").slice(-2).join(".");
  return !NON_COMPETITOR_DOMAINS.has(host) && !NON_COMPETITOR_DOMAINS.has(base);
}

function evidenceList(value: Prisma.JsonValue | null): EvidenceEntry[] {
  return Array.isArray(value) ? (value as unknown as EvidenceEntry[]) : [];
}

function mergeEvidence(existing: EvidenceEntry[], incoming: EvidenceEntry[]): EvidenceEntry[] {
  const seen = new Set(existing.map((entry) => `${entry.kind}|${entry.url}|${entry.note}`));
  const merged = [...existing];
  for (const entry of incoming) {
    const key = `${entry.kind}|${entry.url}|${entry.note}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(entry);
    }
  }
  return merged.slice(-40);
}

/** Domain mentions like "example.com" in plain text. Pure. */
export function extractDomainMentions(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.toLowerCase().matchAll(/\b((?:[a-z0-9-]+\.)+(?:com|net|org|es|io|co|tv|info|news|media|uk|de|fr|it|mx|ar))\b/g)) {
    const host = match[1].replace(/^www\./, "");
    if (host.split(".")[0].length >= 3) found.add(host);
  }
  return Array.from(found);
}

/** External link hosts of one page fetched through the guarded client. */
async function outboundHosts(pageUrl: string): Promise<string[]> {
  const url = new URL(pageUrl);
  await validateScrapeUrl(url);
  if (!(await robotsAllows(url))) return [];
  const response = await fetchSourceHttp(url, { accept: "text/html,application/xhtml+xml", timeoutMs: 8_000, connectTimeoutMs: 4_000, retryAttempts: 1, maxBytes: 2 * 1024 * 1024 });
  const $ = load(response.body);
  const hosts = new Set<string>();
  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href") ?? "";
    if (/^https?:\/\//i.test(href)) {
      const host = registrableHost(href);
      if (host) hosts.add(host);
    }
  });
  return Array.from(hosts);
}

type SiteRow = { id: string; name: string; baseUrl: string | null; locale: string };

async function requireSite(tenantId: string, siteId: string): Promise<SiteRow & { host: string }> {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { id: true, name: true, baseUrl: true, locale: true } });
  if (!site) throw new Error("site_not_found");
  const host = site.baseUrl ? registrableHost(site.baseUrl) : null;
  if (!host) throw new Error("site_without_base_url");
  return { ...site, host };
}

// ────────────────────────────────────────────────────────────── Verification

type CoverageSample = { endpoint: string | null; kind: "feed" | "sitemap" | null; items: FeedSampleItem[]; error: string | null };

function titleFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    const words = decodeURIComponent(segment).replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[-_]+/g, " ").trim();
    return words.length >= 4 && !/^\d+$/.test(words) ? words : null;
  } catch {
    return null;
  }
}

/** Sample public titles from a competitor's feed or sitemap (robots respected). */
async function sampleCompetitorCoverage(origin: string, known: { feedUrl: string | null; sitemapUrl: string | null }, sampleSize: number): Promise<CoverageSample> {
  let endpoints = [known.feedUrl, known.sitemapUrl].filter((url): url is string => Boolean(url));
  if (endpoints.length === 0) {
    const discovered = await discoverFeedsForUrl({ url: origin });
    endpoints = discovered.candidates
      .filter((candidate) => candidate.verified)
      .sort((a, b) => Number(b.type !== "sitemap") - Number(a.type !== "sitemap"))
      .map((candidate) => candidate.url);
    if (endpoints.length === 0) return { endpoint: null, kind: null, items: [], error: discovered.errors[0] ?? "no_public_feed_or_sitemap" };
  }
  let lastError: string | null = null;
  for (const endpoint of endpoints.slice(0, 3)) {
    try {
      if (!(await robotsAllows(new URL(endpoint)))) {
        lastError = "robots_disallow";
        continue;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      continue;
    }
    let check = await verifyFeedCandidate(endpoint, { sampleSize });
    let items = check.sample ?? [];
    // Sitemap index: follow at most two child sitemaps, preferring post/news ones.
    if (check.verified && items.length > 0 && items.every((item) => /\.xml(\.gz)?$/i.test(item.url ?? ""))) {
      const children = items.map((item) => item.url as string).sort((a, b) => Number(/post|news|article/i.test(b)) - Number(/post|news|article/i.test(a))).slice(0, 2);
      items = [];
      for (const child of children) {
        check = await verifyFeedCandidate(child, { sampleSize });
        items.push(...(check.sample ?? []));
      }
    }
    if (check.verified && items.length > 0) {
      const kind = check.type === "rss" || check.type === "atom" ? "feed" : "sitemap";
      return { endpoint, kind, items: items.map((item) => ({ ...item, title: item.title && item.title !== item.url ? item.title : titleFromUrl(item.url) ?? item.title })), error: null };
    }
    lastError = check.note ?? "empty_feed";
  }
  return { endpoint: null, kind: null, items: [], error: lastError };
}

async function verifyCompetitor(competitor: Competitor, vocabulary: TopicTerm[]): Promise<Competitor> {
  const sample = await sampleCompetitorCoverage(competitor.origin, { feedUrl: competitor.feedUrl, sitemapUrl: competitor.sitemapUrl }, 40).catch((error: unknown) => ({
    endpoint: null,
    kind: null,
    items: [],
    error: error instanceof Error ? error.message : String(error),
  }) as CoverageSample);
  const topicCounts = new Map<string, number>();
  for (const item of sample.items) {
    for (const topic of classifyTopics(item.title ?? "", vocabulary)) topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
  }
  const overlapTopics = Array.from(topicCounts.entries()).sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, sampledPages: count }));
  const verified = Boolean(sample.endpoint) && overlapTopics.length > 0;
  const now = new Date();
  const evidence = sample.endpoint
    ? mergeEvidence(evidenceList(competitor.evidence), [{ kind: sample.kind === "feed" ? "feed_fetched" : "sitemap_fetched", url: sample.endpoint, note: `${sample.items.length} public entries sampled; ${overlapTopics.length} overlapping topic(s)`, observedAt: now.toISOString() }])
    : evidenceList(competitor.evidence);
  return prisma.competitor.update({
    where: { id: competitor.id },
    data: {
      verification: verified ? "verified" : "speculative",
      overlapTopics: overlapTopics as unknown as Prisma.InputJsonValue,
      overlapScore: vocabulary.length ? Math.round((overlapTopics.length / vocabulary.length) * 100) / 100 : null,
      feedUrl: sample.kind === "feed" ? sample.endpoint : competitor.feedUrl,
      sitemapUrl: sample.kind === "sitemap" ? sample.endpoint : competitor.sitemapUrl,
      lastCheckedAt: now,
      lastError: sample.error,
      evidence: evidence as unknown as Prisma.InputJsonValue,
    },
  });
}

// ────────────────────────────────────────────────────────────── Discovery

export type CompetitorDiscoveryResult = { siteId: string; candidates: number; created: number; updated: number; verified: number; speculative: number; skipped: string[]; errors: string[] };

export async function discoverCompetitors(tenantId: string, siteId: string, options: { maxCandidates?: number; samplePages?: number } = {}): Promise<CompetitorDiscoveryResult> {
  const site = await requireSite(tenantId, siteId);
  const result: CompetitorDiscoveryResult = { siteId, candidates: 0, created: 0, updated: 0, verified: 0, speculative: 0, skipped: [], errors: [] };
  const [vocabulary, blocked] = await Promise.all([loadSiteTopicVocabulary(tenantId, siteId), loadBlockedDomainSet(tenantId)]);
  const observedAt = new Date().toISOString();
  const evidence = new Map<string, EvidenceEntry[]>();
  const note = (host: string | null, entry: EvidenceEntry) => {
    if (!isCandidateHost(host, site.host, blocked)) return;
    evidence.set(host, [...(evidence.get(host) ?? []), entry]);
  };

  // 1. Outbound links on a sample of the site's own indexed pages.
  const pages = await prisma.siteIndexedPage.findMany({
    where: { tenantId, siteId },
    orderBy: [{ lastIndexedAt: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: { url: true, content: true },
  });
  for (const page of pages.slice(0, options.samplePages ?? 6)) {
    try {
      for (const host of await outboundHosts(page.url)) note(host, { kind: "outbound_link", url: page.url, note: `Your page links to ${host}`, observedAt });
    } catch (error) {
      result.errors.push(`outbound(${page.url}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // 2. Domain mentions in the indexed inventory (read-only).
  for (const page of pages) {
    for (const host of extractDomainMentions(page.content ?? "")) note(host, { kind: "mention", url: page.url, note: `${host} is mentioned in your content`, observedAt });
  }
  // 3. Domains of the site's sources and source recommendations with topic overlap.
  const recommendations = await prisma.sourceRecommendation.findMany({
    where: { tenantId, siteId, relationship: "external", status: { in: ["open", "accepted"] } },
    select: { domain: true, url: true, topics: true, status: true },
  });
  for (const recommendation of recommendations) {
    const topics = Array.isArray(recommendation.topics) ? (recommendation.topics as string[]) : [];
    if (topics.length === 0) continue;
    note(registrableHost(recommendation.domain), { kind: "source_overlap", url: recommendation.url, note: `${recommendation.status} source covering ${topics.slice(0, 4).join(", ")}`, observedAt });
  }
  // 4. Web search results for the main topics, only when a provider is configured.
  const provider = getWebIntelligenceProvider();
  if (!provider) {
    result.skipped.push("web_search_provider_not_configured");
  } else {
    for (const topic of vocabulary.slice(0, 3)) {
      try {
        const hits = await provider.search(topic.name, { limit: 8, language: site.locale.slice(0, 2) });
        await recordWebUsage({ tenantId, siteId, provider: provider.name, operation: "search", queries: 1 });
        for (const hit of hits) note(registrableHost(hit.domain || hit.url), { kind: "search_result", url: hit.url, note: `Ranks in ${provider.name} results for "${topic.name}"`, observedAt });
      } catch (error) {
        result.errors.push(`search(${topic.name}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const shortlist = Array.from(evidence.entries())
    .map(([host, entries]) => ({ host, entries, kinds: new Set(entries.map((entry) => entry.kind)).size }))
    .sort((a, b) => b.kinds - a.kinds || b.entries.length - a.entries.length)
    .slice(0, options.maxCandidates ?? 8);
  result.candidates = shortlist.length;
  for (const candidate of shortlist) {
    const existing = await prisma.competitor.findUnique({ where: { siteId_domain: { siteId, domain: candidate.host } } });
    let competitor: Competitor;
    if (existing) {
      // Re-runs refresh evidence but never override an operator's decision.
      competitor = await prisma.competitor.update({ where: { id: existing.id }, data: { evidence: mergeEvidence(evidenceList(existing.evidence), candidate.entries) as unknown as Prisma.InputJsonValue } });
      result.updated += 1;
    } else {
      competitor = await prisma.competitor.create({
        data: { tenantId, siteId, domain: candidate.host, origin: `https://${candidate.host}`, name: candidate.host, evidence: mergeEvidence([], candidate.entries) as unknown as Prisma.InputJsonValue },
      });
      result.created += 1;
    }
    if (competitor.status === "rejected" || competitor.status === "removed") continue;
    competitor = await verifyCompetitor(competitor, vocabulary);
    if (competitor.verification === "verified") result.verified += 1;
    else result.speculative += 1;
  }
  await writeAudit({ tenantId, actorType: "automation", action: "competitors.discovered", entityType: "site", entityId: siteId, metadata: { ...result, errors: result.errors.slice(0, 5) } });
  return result;
}

registerOnboardingStep("competitors", async ({ tenantId, siteId }) => {
  const result = await discoverCompetitors(tenantId, siteId);
  return {
    summary: `Shortlisted ${result.candidates} possible competitor(s) from observable evidence: ${result.verified} verified, ${result.speculative} speculative. Accept the relevant ones in Competitors to measure coverage gaps.`,
    counts: { candidates: result.candidates, verified: result.verified, speculative: result.speculative, created: result.created },
  };
});

// ────────────────────────────────────────────────────────────── Management

export async function listCompetitors(tenantId: string, siteId: string, filters: { status?: string } = {}) {
  await requireSite(tenantId, siteId);
  const rows = await prisma.competitor.findMany({
    where: { tenantId, siteId, ...(filters.status ? { status: filters.status } : { status: { not: "removed" } }) },
    include: { _count: { select: { snapshots: true, opportunities: true } } },
    orderBy: [{ status: "asc" }, { verification: "desc" }, { domain: "asc" }],
  });
  return rows.map(({ _count, ...row }) => ({ ...row, snapshotsCount: _count.snapshots, opportunitiesCount: _count.opportunities }));
}

async function requireCompetitor(tenantId: string, siteId: string, competitorId: string) {
  const competitor = await prisma.competitor.findFirst({ where: { id: competitorId, tenantId, siteId } });
  if (!competitor) throw new Error("competitor_not_found");
  return competitor;
}

export async function addCompetitorManually(tenantId: string, siteId: string, input: { url: string; name?: string | null; notes?: string | null }, userId: string | null) {
  const site = await requireSite(tenantId, siteId);
  const host = registrableHost(input.url);
  if (!host || host === site.host) throw new Error("invalid_competitor_domain");
  const observedAt = new Date().toISOString();
  const existing = await prisma.competitor.findUnique({ where: { siteId_domain: { siteId, domain: host } } });
  const manual: EvidenceEntry = { kind: "manual", url: `https://${host}`, note: "Added by an editor", observedAt };
  let competitor = existing
    ? await prisma.competitor.update({ where: { id: existing.id }, data: { status: "accepted", evidence: mergeEvidence(evidenceList(existing.evidence), [manual]) as unknown as Prisma.InputJsonValue } })
    : await prisma.competitor.create({ data: { tenantId, siteId, domain: host, origin: `https://${host}`, name: input.name?.trim() || host, notes: input.notes ?? null, status: "accepted", evidence: [manual] as unknown as Prisma.InputJsonValue } });
  competitor = await verifyCompetitor(competitor, await loadSiteTopicVocabulary(tenantId, siteId));
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "competitor.added", entityType: "competitor", entityId: competitor.id, metadata: { domain: host } });
  return competitor;
}

export async function updateCompetitor(
  tenantId: string,
  siteId: string,
  competitorId: string,
  patch: { name?: string; notes?: string | null; status?: string; feedUrl?: string | null; sitemapUrl?: string | null },
  userId: string | null,
) {
  const competitor = await requireCompetitor(tenantId, siteId, competitorId);
  if (patch.status !== undefined && !(COMPETITOR_STATUSES as readonly string[]).includes(patch.status)) throw new Error("invalid status");
  for (const key of ["feedUrl", "sitemapUrl"] as const) {
    const value = patch[key];
    if (value && registrableHost(value) !== competitor.domain) throw new Error(`${key} must be on ${competitor.domain}`);
  }
  // Evidence is never touched here: remove is a status, so history stays auditable.
  const updated = await prisma.competitor.update({
    where: { id: competitor.id },
    data: {
      name: patch.name?.trim() || undefined,
      notes: patch.notes === undefined ? undefined : patch.notes,
      status: patch.status,
      feedUrl: patch.feedUrl === undefined ? undefined : patch.feedUrl,
      sitemapUrl: patch.sitemapUrl === undefined ? undefined : patch.sitemapUrl,
    },
  });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "competitor.updated", entityType: "competitor", entityId: competitor.id, metadata: { from: competitor.status, to: updated.status } });
  return updated;
}

// ────────────────────────────────────────────────────────────── Coverage + gaps

type SitePage = { url: string; title: string; topics: string[]; modifiedAt: Date | null };

async function loadSitePages(tenantId: string, siteId: string, vocabulary: TopicTerm[]): Promise<SitePage[]> {
  const pages = await prisma.siteIndexedPage.findMany({
    where: { tenantId, siteId },
    select: { url: true, title: true, h1: true, metaTitle: true, modifiedAt: true, publishedAt: true },
    take: 3000,
  });
  return pages.map((page) => {
    const title = page.title ?? page.h1 ?? page.metaTitle ?? titleFromUrl(page.url) ?? page.url;
    return { url: page.url, title, topics: classifyTopics(`${title} ${page.h1 ?? ""}`, vocabulary), modifiedAt: page.modifiedAt ?? page.publishedAt };
  });
}

export async function refreshCompetitorCoverage(tenantId: string, siteId: string, competitorId?: string) {
  await requireSite(tenantId, siteId);
  const vocabulary = await loadSiteTopicVocabulary(tenantId, siteId);
  const competitors = await prisma.competitor.findMany({ where: { tenantId, siteId, status: "accepted", ...(competitorId ? { id: competitorId } : {}) } });
  const summary = { competitors: competitors.length, sampled: 0, errors: [] as string[], opportunities: { created: 0, updated: 0 } };
  for (const competitor of competitors) {
    const sample = await sampleCompetitorCoverage(competitor.origin, competitor, 200).catch((error: unknown) => ({ endpoint: null, kind: null, items: [], error: String(error) }) as CoverageSample);
    if (!sample.endpoint) {
      summary.errors.push(`${competitor.domain}: ${sample.error}`);
      await prisma.competitor.update({ where: { id: competitor.id }, data: { lastError: sample.error, lastCheckedAt: new Date() } });
      continue;
    }
    const observedAt = new Date();
    for (const item of sample.items) {
      if (!item.url || registrableHost(item.url) !== competitor.domain) continue;
      const topic = classifyTopics(item.title ?? "", vocabulary)[0] ?? null;
      await prisma.competitorCoverageSnapshot.upsert({
        where: { competitorId_url: { competitorId: competitor.id, url: item.url } },
        create: { tenantId, siteId, competitorId: competitor.id, url: item.url, title: item.title?.slice(0, 300) ?? null, topic, observedAt },
        update: { title: item.title?.slice(0, 300) ?? null, topic, observedAt },
      });
      summary.sampled += 1;
    }
    await prisma.competitor.update({ where: { id: competitor.id }, data: { lastError: null, lastCheckedAt: observedAt } });
  }
  summary.opportunities = await computeOpportunities(tenantId, siteId);
  return summary;
}

export async function getCoverageComparison(tenantId: string, siteId: string) {
  await requireSite(tenantId, siteId);
  const vocabulary = await loadSiteTopicVocabulary(tenantId, siteId);
  const [pages, snapshots, competitors] = await Promise.all([
    loadSitePages(tenantId, siteId, vocabulary),
    prisma.competitorCoverageSnapshot.findMany({ where: { tenantId, siteId, competitor: { status: "accepted" } }, select: { competitorId: true, topic: true } }),
    prisma.competitor.findMany({ where: { tenantId, siteId, status: "accepted" }, select: { id: true, domain: true, name: true } }),
  ]);
  const rows = vocabulary.map((topic) => {
    const sitePages = pages.filter((page) => page.topics.includes(topic.name));
    const byCompetitor: Record<string, number> = {};
    for (const snapshot of snapshots) if (snapshot.topic === topic.name) byCompetitor[snapshot.competitorId] = (byCompetitor[snapshot.competitorId] ?? 0) + 1;
    return { topic: topic.name, sitePages: sitePages.length, siteSampleUrls: sitePages.slice(0, 3).map((page) => page.url), competitorPages: byCompetitor };
  });
  const unclassified: Record<string, number> = {};
  for (const snapshot of snapshots) if (!snapshot.topic) unclassified[snapshot.competitorId] = (unclassified[snapshot.competitorId] ?? 0) + 1;
  return { competitors, topics: rows, unclassifiedCompetitorPages: unclassified, sampledCompetitorPages: snapshots.length, sitePages: pages.length };
}

function jaccard(a: string[], b: string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  const shared = Array.from(left).filter((token) => right.has(token)).length;
  return shared / Math.max(1, new Set([...left, ...right]).size);
}

type OpportunityDraft = {
  kind: (typeof OPPORTUNITY_KINDS)[number];
  topic: string;
  competitorId: string | null;
  rationale: string;
  evidence: Array<{ url: string; title: string | null; competitor: string | null }>;
  relatedSiteUrls: string[];
  targetUrl: string | null;
};

function slug(value: string): string {
  return tokenize(value).join("-").slice(0, 80) || "topic";
}

/** Pure gap analysis over sampled competitor titles and the site's inventory. */
export function buildOpportunityDrafts(input: {
  vocabulary: TopicTerm[];
  sitePages: SitePage[];
  snapshots: Array<{ competitorId: string; domain: string; url: string; title: string | null; topic: string | null; observedAt: Date }>;
  now?: Date;
}): OpportunityDraft[] {
  const now = input.now ?? new Date();
  const drafts: OpportunityDraft[] = [];
  const evidenceOf = (rows: typeof input.snapshots) => rows.slice(0, 5).map((row) => ({ url: row.url, title: row.title, competitor: row.domain }));
  const dominant = (rows: typeof input.snapshots) => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.competitorId, (counts.get(row.competitorId) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };

  for (const topic of input.vocabulary) {
    const site = input.sitePages.filter((page) => page.topics.includes(topic.name));
    const rivals = input.snapshots.filter((row) => row.topic === topic.name);
    const rivalDomains = new Set(rivals.map((row) => row.domain)).size;
    if (rivals.length === 0) continue;
    if (site.length === 0) {
      drafts.push({ kind: "missing_topic", topic: topic.name, competitorId: dominant(rivals), rationale: `${rivals.length} sampled page(s) from ${rivalDomains} competitor(s) cover "${topic.name}", and none of your indexed pages do.`, evidence: evidenceOf(rivals), relatedSiteUrls: [], targetUrl: null });
    } else if (rivals.length >= 3 && rivals.length >= site.length * 3) {
      drafts.push({ kind: "underdeveloped_cluster", topic: topic.name, competitorId: dominant(rivals), rationale: `Competitors have ${rivals.length} sampled page(s) on "${topic.name}" versus your ${site.length}. The cluster looks thin compared with observed coverage.`, evidence: evidenceOf(rivals), relatedSiteUrls: site.slice(0, 5).map((page) => page.url), targetUrl: null });
    } else if (site.length >= 3 && rivals.length >= 5) {
      drafts.push({ kind: "differentiated_angle", topic: topic.name, competitorId: null, rationale: `"${topic.name}" is crowded (${rivals.length} competitor pages, ${site.length} of yours). Plan an angle competitors do not cover instead of a near-duplicate.`, evidence: evidenceOf(rivals), relatedSiteUrls: site.slice(0, 5).map((page) => page.url), targetUrl: null });
    }
    const recentRivals = rivals.filter((row) => now.getTime() - row.observedAt.getTime() <= 45 * 86_400_000);
    const stale = site.filter((page) => page.modifiedAt && now.getTime() - page.modifiedAt.getTime() > 180 * 86_400_000).sort((a, b) => (a.modifiedAt?.getTime() ?? 0) - (b.modifiedAt?.getTime() ?? 0))[0];
    if (stale && recentRivals.length > 0) {
      drafts.push({ kind: "improve_existing", topic: topic.name, competitorId: dominant(recentRivals), rationale: `Your page "${stale.title}" was last modified ${stale.modifiedAt?.toISOString().slice(0, 10)}, while competitors currently list ${recentRivals.length} page(s) on "${topic.name}".`, evidence: evidenceOf(recentRivals), relatedSiteUrls: [stale.url], targetUrl: stale.url });
    }
    for (let i = 0; i < site.length; i += 1) {
      for (let j = i + 1; j < site.length; j += 1) {
        if (jaccard(tokenize(site[i].title), tokenize(site[j].title)) >= 0.6) {
          drafts.push({ kind: "cannibalization_risk", topic: topic.name, competitorId: null, rationale: `Two of your pages on "${topic.name}" have near-identical titles and may compete with each other.`, evidence: [], relatedSiteUrls: [site[i].url, site[j].url], targetUrl: site[j].url });
          j = site.length;
          i = site.length;
        }
      }
    }
  }

  // Terms competitors use repeatedly that never appear in your titles or vocabulary.
  const siteTokens = new Set(input.sitePages.flatMap((page) => tokenize(page.title)));
  for (const topic of input.vocabulary) for (const term of topic.terms) for (const part of term.split(" ")) siteTokens.add(part);
  const termRows = new Map<string, typeof input.snapshots>();
  for (const row of input.snapshots) {
    if (!row.title) continue;
    for (const token of new Set(tokenize(row.title))) {
      if (siteTokens.has(token) || token.length < 4 || /^\d+$/.test(token)) continue;
      termRows.set(token, [...(termRows.get(token) ?? []), row]);
    }
  }
  const terms = Array.from(termRows.entries())
    .filter(([, rows]) => rows.length >= 3 && new Set(rows.map((row) => row.domain)).size >= 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);
  for (const [term, rows] of terms) {
    drafts.push({ kind: "missing_topic", topic: term, competitorId: dominant(rows), rationale: `"${term}" appears in ${rows.length} sampled competitor title(s) and in none of your indexed titles.`, evidence: evidenceOf(rows), relatedSiteUrls: [], targetUrl: null });
  }
  return drafts;
}

export async function computeOpportunities(tenantId: string, siteId: string): Promise<{ created: number; updated: number }> {
  const vocabulary = await loadSiteTopicVocabulary(tenantId, siteId);
  const [sitePages, snapshots] = await Promise.all([
    loadSitePages(tenantId, siteId, vocabulary),
    prisma.competitorCoverageSnapshot.findMany({ where: { tenantId, siteId, competitor: { status: "accepted" } }, include: { competitor: { select: { domain: true } } }, take: 5000 }),
  ]);
  const drafts = buildOpportunityDrafts({ vocabulary, sitePages, snapshots: snapshots.map((row) => ({ ...row, domain: row.competitor.domain })) });
  const counts = { created: 0, updated: 0 };
  for (const draft of drafts) {
    const dedupeKey = `${draft.kind}:${slug(draft.topic)}${draft.targetUrl ? `:${draft.targetUrl}` : ""}`.slice(0, 500);
    const data = {
      competitorId: draft.competitorId,
      rationale: draft.rationale,
      evidence: draft.evidence as unknown as Prisma.InputJsonValue,
      relatedSiteUrls: draft.relatedSiteUrls as unknown as Prisma.InputJsonValue,
      targetUrl: draft.targetUrl,
    };
    const existing = await prisma.contentOpportunity.findUnique({ where: { siteId_dedupeKey: { siteId, dedupeKey } } });
    if (!existing) {
      await prisma.contentOpportunity.create({ data: { ...data, tenantId, siteId, kind: draft.kind, topic: draft.topic, dedupeKey } });
      counts.created += 1;
    } else if (existing.status === "open" || existing.status === "monitoring") {
      await prisma.contentOpportunity.update({ where: { id: existing.id }, data });
      counts.updated += 1;
    }
  }
  return counts;
}

export async function listOpportunities(tenantId: string, siteId: string, filters: { status?: string; kind?: string } = {}) {
  await requireSite(tenantId, siteId);
  return prisma.contentOpportunity.findMany({
    where: { tenantId, siteId, ...(filters.status ? { status: filters.status } : {}), ...(filters.kind ? { kind: filters.kind } : {}) },
    include: { competitor: { select: { id: true, domain: true, name: true } } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 300,
  });
}

// ────────────────────────────────────────────────────────────── Opportunity actions

function proposalTitle(kind: string, topic: string, targetTitle: string | null): string {
  switch (kind) {
    case "missing_topic":
      return `Cover "${topic}"`;
    case "underdeveloped_cluster":
      return `Expand the ${topic} cluster`;
    case "improve_existing":
      return `Update: ${targetTitle ?? topic}`;
    case "differentiated_angle":
      return `${topic}: an angle competitors miss`;
    default:
      return `Consolidate overlapping ${topic} pages`;
  }
}

function dayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function nextFreeDay(client: Prisma.TransactionClient, planId: string, from: Date, to: Date): Promise<Date | null> {
  const taken = await client.editorialPlanItem.findMany({ where: { planId, scheduledFor: { not: null, gte: from, lte: to } }, select: { scheduledFor: true } });
  const busy = new Set(taken.map((item) => dayStart(item.scheduledFor as Date).toISOString()));
  for (let day = dayStart(from); day <= to; day = new Date(day.getTime() + 86_400_000)) {
    if (!busy.has(day.toISOString())) return new Date(day.getTime() + 9 * 3_600_000);
  }
  return null;
}

/**
 * Create exactly one proposed plan item for an opportunity (idempotent).
 * `mode: "update"` records an "improve existing article" intent on targetUrl.
 */
export async function addOpportunityToPlan(tenantId: string, siteId: string, opportunityId: string, input: { mode?: "new" | "update"; targetUrl?: string | null }, userId: string | null) {
  const opportunity = await prisma.contentOpportunity.findFirst({ where: { id: opportunityId, tenantId, siteId }, include: { competitor: { select: { domain: true } } } });
  if (!opportunity) throw new Error("opportunity_not_found");
  if (opportunity.planItemId) {
    const existing = await prisma.editorialPlanItem.findFirst({ where: { id: opportunity.planItemId, tenantId } });
    if (existing) return { opportunity, planItem: existing, created: false };
  }
  const mode = input.mode ?? (opportunity.kind === "improve_existing" ? "update" : "new");
  const relatedSiteUrls = Array.isArray(opportunity.relatedSiteUrls) ? (opportunity.relatedSiteUrls as string[]) : [];
  const targetUrl = mode === "update" ? (input.targetUrl ?? opportunity.targetUrl ?? relatedSiteUrls[0] ?? null) : null;
  let targetTitle: string | null = null;
  if (mode === "update") {
    if (!targetUrl) throw new Error("targetUrl is required to improve an existing article");
    const page = await prisma.siteIndexedPage.findFirst({ where: { tenantId, siteId, url: targetUrl }, select: { title: true } });
    if (!page) throw new Error("targetUrl must be one of the site's indexed pages");
    targetTitle = page.title;
  }
  const evidence = Array.isArray(opportunity.evidence) ? (opportunity.evidence as Array<{ url: string; title: string | null }>) : [];
  const sourceEvidence = [
    ...evidence.slice(0, 5).map((entry) => ({ sourceType: "source", url: entry.url, title: entry.title ?? undefined })),
    ...(targetUrl ? [targetUrl] : relatedSiteUrls).slice(0, 3).map((url) => ({ sourceType: "indexed-page", url })),
  ];

  return prisma.$transaction(async (tx) => {
    // Claim the opportunity first so concurrent clicks cannot create two items.
    const claimed = await tx.contentOpportunity.updateMany({ where: { id: opportunity.id, planItemId: opportunity.planItemId }, data: { status: "planned" } });
    if (claimed.count === 0) {
      const current = await tx.contentOpportunity.findUnique({ where: { id: opportunity.id } });
      const planItem = current?.planItemId ? await tx.editorialPlanItem.findUnique({ where: { id: current.planItemId } }) : null;
      if (planItem) return { opportunity: current, planItem, created: false };
      throw new Error("opportunity_already_planned");
    }
    let plan = await tx.editorialPlan.findFirst({ where: { tenantId, siteId, status: { in: ["ready", "partial"] } }, orderBy: { createdAt: "desc" } });
    const now = new Date();
    plan ??=
      (await tx.editorialPlan.findFirst({ where: { tenantId, siteId, name: "Backlog", status: "ready" } })) ??
      (await tx.editorialPlan.create({
        data: { tenantId, siteId, name: "Backlog", status: "ready", dateFrom: dayStart(now), dateTo: new Date(dayStart(now).getTime() + 365 * 86_400_000), objective: "Proposals created from competitor opportunities" },
      }));
    const from = new Date(Math.max(dayStart(now).getTime() + 86_400_000, plan.dateFrom.getTime()));
    const scheduledFor = await nextFreeDay(tx, plan.id, from, plan.dateTo);
    const planItem = await tx.editorialPlanItem.create({
      data: {
        tenantId,
        planId: plan.id,
        siteId,
        title: proposalTitle(opportunity.kind, opportunity.topic, targetTitle).slice(0, 300),
        topic: opportunity.topic,
        channel: "website",
        status: "proposed",
        contentType: mode === "update" ? "update" : null,
        scheduledFor,
        rationale: opportunity.rationale,
        competitorAngle: opportunity.competitor ? `Observed on ${opportunity.competitor.domain}` : null,
        sourceEvidence: sourceEvidence as unknown as Prisma.InputJsonValue,
        metadata: { origin: "content_opportunity", opportunityId: opportunity.id, kind: opportunity.kind, targetUrl, createdBy: userId } as Prisma.InputJsonObject,
      },
    });
    const updated = await tx.contentOpportunity.update({ where: { id: opportunity.id }, data: { planItemId: planItem.id, targetUrl: targetUrl ?? opportunity.targetUrl } });
    await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "opportunity.planned", entityType: "content_opportunity", entityId: opportunity.id, metadata: { planId: plan.id, planItemId: planItem.id, mode } }, tx);
    return { opportunity: updated, planItem, created: true };
  });
}

export async function setOpportunityStatus(tenantId: string, siteId: string, opportunityId: string, status: "dismissed" | "monitoring" | "open", userId: string | null) {
  const opportunity = await prisma.contentOpportunity.findFirst({ where: { id: opportunityId, tenantId, siteId } });
  if (!opportunity) throw new Error("opportunity_not_found");
  const updated = await prisma.contentOpportunity.update({ where: { id: opportunity.id }, data: { status } });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: `opportunity.${status}`, entityType: "content_opportunity", entityId: opportunity.id });
  return updated;
}
