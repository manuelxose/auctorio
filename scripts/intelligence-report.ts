// Intelligence observability report (Phase 3).
//
// Two modes:
//   --live            Aggregate real counters from discovery runs in the DB.
//   (default)         Run a deterministic simulation through the pipeline
//                     with ground-truth story labels and report:
//                       - average AI calls per 100 source items
//                       - external enrichment calls per 100 source items
//                       - cache hit ratio
//                       - false merge / false split cases found
//                       - approximate candidate funnel
//
// No live network calls: providers are stubbed deterministically.

import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { emptyDiscoveredItem } from "../src/studio/adapters/normalize";
import { upsertSourceItem } from "../src/studio/sources";
import { runIntelligencePipelineForItem } from "../src/studio/intelligence/pipeline";
import { buildIntelligenceReport } from "../src/studio/intelligence/observability";
import { updateIntelligenceSettings } from "../src/studio/intelligence/intelligence-settings";
import { persistSiteEditorialProfile } from "../src/studio/intelligence/site-editorial-profile";
import { setMovieTvProviderEngine } from "../src/studio/domains/movie-tv/plugin";
import { setAiJudgeFactory, type AiJudgeConfig } from "../src/studio/intelligence/ai-judge";
import { ProviderEngine } from "../src/studio/enrichment/engine";
import {
  type EnrichmentLookupInput,
  type EnrichmentLookupResult,
  type EnrichmentPayload,
  type EnrichmentProviderAdapter,
} from "../src/studio/enrichment/adapter";
import { createCostCounters, mergeCostCounters, ratesPer100, type CostCounters } from "../src/studio/intelligence/cost-control";
import { createProviderCacheStats, resetProviderRateWindows } from "../src/studio/enrichment/provider-cache";

const prisma = getPrismaClient();

class SimProvider implements EnrichmentProviderAdapter {
  readonly providerKey = "sim";
  readonly attribution = "simulation provider";
  calls = 0;
  isConfigured(): boolean {
    return true;
  }
  async lookup(input: EnrichmentLookupInput): Promise<EnrichmentLookupResult> {
    this.calls += 1;
    const payload: EnrichmentPayload = {
      id: `sim-${input.query}-${input.year ?? 0}`,
      resourceType: input.resourceType,
      title: input.query,
      originalTitle: null,
      releaseDate: input.year ? `${input.year}-06-01` : "2024-06-01",
      year: input.year ?? 2024,
      genres: ["Drama"],
      popularity: 5,
      rating: 7,
      votes: 500,
      cast: ["Actor A"],
      crew: ["Director A"],
      studios: ["Studio A"],
      franchise: null,
      overview: "sim",
      posterUrl: null,
      backdropUrl: null,
      watchProviders: [],
      extra: {},
    };
    return {
      providerKey: this.providerKey,
      resourceType: input.resourceType,
      match: payload,
      alternatives: [],
      matchMethod: input.year ? "year_match" : "search",
      confidence: input.year ? 0.85 : 0.7,
      attribution: { source: "sim", creditText: "simulation provider", fetchedAt: new Date().toISOString() },
    };
  }
}

type SimItem = { title: string; label: string; publisher: string; score: number };

/** Ground-truth dataset: labels identify the same real-world story. */
const SIM_ITEMS: SimItem[] = [
  // Story 1: three independent publishers + 1 syndicated mirror + 1 update.
  { title: "Dune: Part Three Officially Greenlit at Warner Bros", label: "dune3", publisher: "a", score: 0.9 },
  { title: "Dune: Part Three Officially Greenlit at Warner Bros", label: "dune3", publisher: "b", score: 0.85 },
  { title: "Dune: Part Three Officially Greenlit at Warner Bros", label: "dune3", publisher: "c", score: 0.8 },
  { title: "Dune: Part Three Officially Greenlit at Warner Bros", label: "dune3-mirror", publisher: "a-mirror", score: 0.8 },
  // Story 2: remake ambiguity — two different years are DIFFERENT stories.
  { title: "Suspiria Remake (2018) Gets First Official Trailer", label: "suspiria2018", publisher: "a", score: 0.85 },
  { title: "Suspiria Classic (1977) Gets 4K Restoration Release", label: "suspiria1977", publisher: "b", score: 0.8 },
  // Story 3: same franchise, different announcement.
  { title: "Marvel: Blade Reboot Pushed Back To Next Fall", label: "blade", publisher: "a", score: 0.8 },
  { title: "Marvel: Blade Reboot Pushed Back To Next Fall", label: "blade", publisher: "b", score: 0.75 },
  // Story 4: actor/movie name collision — person story, not a film.
  { title: "Sydney Sweeney Joins New Comedy Movie At Sony", label: "sweeney", publisher: "a", score: 0.7 },
  // Story 5: conflicting release-year claims across publishers.
  { title: "Dune Remake (2021) Gets Official Release Date", label: "dune-year-conflict", publisher: "a", score: 0.8 },
  { title: "Dune Remake (1984) Gets Official Release Date", label: "dune-year-conflict", publisher: "b", score: 0.8 },
  // Irrelevant stories (economy/politics) for an entertainment site.
  { title: "Central Bank Raises Interest Rates Across The Eurozone", label: "econ-1", publisher: "a", score: 0.6 },
  { title: "European Commission Proposes New Trade Agreement Rules", label: "econ-2", publisher: "b", score: 0.5 },
  // High-value ambiguous item (LLM judge gate).
  { title: "Warner Bros Dune Part Three Sequel Window Update", label: "dune3", publisher: "c", score: 0.9 },
];

async function runSimulation(): Promise<void> {
  const seed = `sim-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-k`), status: "active" } });
  const site = await prisma.site.create({
    data: { tenantId: tenant.id, key: seed, name: `${seed}-site`, type: "generic_rest", locale: "en-US", baseUrl: `https://${seed}.example.com` },
  });
  await persistSiteEditorialProfile(tenant.id, site.id, {
    siteId: site.id,
    profileVersion: 1,
    builtAt: new Date().toISOString(),
    topics: ["movies", "series", "streaming", "tv"],
    categories: ["cine", "series"],
    taxonomy: [],
    audience: [],
    language: "en",
    location: [],
    editorialDescription: "Entertainment news site.",
    contentGaps: [
      { topic: "movies", score: 0.6, reason: "no_existing_coverage" },
      { topic: "series", score: 0.6, reason: "no_existing_coverage" },
    ],
    existingTitles: [],
    sitemapUrl: null,
    articleStats: { articleCount: 0, avgTitleTokens: 0 },
  });

  const publishers = new Map<string, string>();
  for (const key of ["a", "b", "c", "a-mirror"]) {
    const source = await prisma.contentSource.create({
      data: {
        tenantId: tenant.id,
        name: `${seed}-${key}`,
        type: "rss",
        url: `https://${key.replace("-", ".")}.example/feed`,
        domain: key === "a-mirror" ? "a.example" : `${key}.example`,
        trustScore: key === "a" ? 0.9 : key === "b" ? 0.8 : 0.6,
        authorityScore: key === "a" ? 0.9 : key === "b" ? 0.8 : 0.6,
        language: "en",
        siteId: site.id,
      },
    });
    publishers.set(key, source.id);
  }

  // Settings: movie_tv domain on, fake provider precedence, LLM judge enabled
  // (mock text provider locally — counts as an AI call without network).
  await updateIntelligenceSettings(tenant.id, {
    enabledDomains: ["movie_tv"],
    providerPrecedence: { identity: ["sim"], rating: ["sim"], metadata: ["sim"] },
    aiJudge: { enabled: true, model: null, maxCallsPerItem: 1 },
    levelPolicy: { maxLevel3PerRun: 50, maxLevel4PerRun: 5, maxEnrichmentCallsPerRun: 200, maxAiCallsPerRun: 10 },
  });

  resetProviderRateWindows();
  const provider = new SimProvider();
  setMovieTvProviderEngine(new ProviderEngine([provider]));
  // Deterministic judge for the simulation: resolves ambiguity in favor of
  // the merge when the deterministic similarity is in the ambiguity zone.
  setAiJudgeFactory((config: AiJudgeConfig) => ({
    enabled: config.enabled,
    async judge() {
      return { decision: "merge", confidence: 0.8, reasoning: "simulation judge: same story" };
    },
  }));
  const stats = createProviderCacheStats();

  const counters: CostCounters = createCostCounters();
  const itemLabels = new Map<string, string>(); // itemId → ground-truth label

  try {
    let index = 0;
    for (const simItem of SIM_ITEMS) {
      index += 1;
      const sourceId = publishers.get(simItem.publisher) as string;
      const nonce = `sim-${index}-${Math.random().toString(16).slice(2, 6)}`;
      const discovered = emptyDiscoveredItem({
        externalId: `sim-ext-${index}`,
        canonicalUrl: `https://${simItem.publisher.replace("-", ".")}.example/sim/${index}`,
        sourceUrl: null,
        title: simItem.title,
        description: `Simulation description ${nonce}.`,
        cleanedText: `Simulation description ${nonce}.`,
        categories: simItem.label.startsWith("econ") ? ["economy"] : ["cine"],
        language: "en",
        publishedAt: "2026-08-31T09:00:00Z",
      });
      const upserted = await upsertSourceItem(tenant.id, sourceId, discovered);
      if (!upserted.created || !upserted.sourceItemId) {
        continue;
      }
      await prisma.sourceItem.update({
        where: { id: upserted.sourceItemId },
        data: { score: simItem.score, processingStatus: simItem.score >= 0.4 ? "candidate" : "parsed" },
      });
      itemLabels.set(upserted.sourceItemId, simItem.label);
      const result = await runIntelligencePipelineForItem(tenant.id, upserted.sourceItemId, { stats });
      mergeCostCounters(counters, result.counters);
    }

    // Ground-truth cluster quality: false merges / false splits.
    const items = await prisma.sourceItem.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, clusterId: true, title: true },
    });
    const byCluster = new Map<string, Array<{ itemId: string; label: string }>>();
    const labelToBase = new Map<string, string>(); // label → canonical base (strip -mirror)
    for (const item of items) {
      const label = itemLabels.get(item.id) ?? "unknown";
      const base = label.endsWith("-mirror") ? label.slice(0, -"-mirror".length) : label;
      labelToBase.set(label, base);
      if (item.clusterId) {
        const list = byCluster.get(item.clusterId) ?? [];
        list.push({ itemId: item.id, label: base });
        byCluster.set(item.clusterId, list);
      }
    }
    let falseMerges = 0;
    let falseSplits = 0;
    const seenLabels = new Set<string>();
    for (const members of byCluster.values()) {
      const bases = new Set(members.map((member) => member.label));
      if (bases.size > 1) {
        falseMerges += 1;
      }
      for (const base of bases) {
        if (seenLabels.has(base)) {
          falseSplits += 1;
        }
        seenLabels.add(base);
      }
    }
    // dune3 story should end in exactly ONE cluster across its items.
    const dune3Clusters = new Set(
      items.filter((item) => (itemLabels.get(item.id) ?? "").split("-")[0] === "dune3").map((item) => item.clusterId),
    );
    if (dune3Clusters.size > 1) {
      falseSplits += dune3Clusters.size - 1;
    }

    const rates = ratesPer100(counters);
    const clusters = await prisma.storyCluster.count({ where: { tenantId: tenant.id, status: { not: "superseded" } } });
    const candidates = await prisma.storyCluster.count({ where: { tenantId: tenant.id, candidateScore: { gte: 0.4 } } });
    const high = await prisma.storyCluster.count({ where: { tenantId: tenant.id, candidateScore: { gte: 0.6 } } });

    const report = {
      mode: "simulation",
      generatedAt: new Date().toISOString(),
      sourceItemsProcessed: SIM_ITEMS.length,
      counters,
      averageAiCallsPer100: rates.aiCallsPer100,
      averageEnrichmentCallsPer100: rates.enrichmentCallsPer100,
      cacheHitRatio: rates.cacheHitRatio,
      providerCalls: provider.calls,
      falseMergeCases: falseMerges,
      falseSplitCases: falseSplits,
      candidateFunnel: {
        source_items: SIM_ITEMS.length,
        clustered: clusters,
        scored_candidates: candidates,
        high_relevance: high,
      },
      clusterAssignments: Array.from(byCluster.entries()).map(([clusterId, members]) => ({
        clusterId,
        labels: members.map((member) => member.label),
      })),
      verificationStates: await prisma.storyCluster.groupBy({
        by: ["verificationState"],
        where: { tenantId: tenant.id },
        _count: { _all: true },
      }),
    };
    console.log(JSON.stringify(report, null, 2));

    console.log("\n── Summary ───────────────────────────────────────────────");
    console.log(`AI calls per 100 source items:            ${report.averageAiCallsPer100}`);
    console.log(`Enrichment calls per 100 source items:    ${report.averageEnrichmentCallsPer100}`);
    console.log(`Cache hit ratio (simulation):             ${report.cacheHitRatio}`);
    console.log(`False merge cases found:                  ${report.falseMergeCases}`);
    console.log(`False split cases found:                  ${report.falseSplitCases}`);
    console.log(`Funnel: ${JSON.stringify(report.candidateFunnel)}`);
  } finally {
    setMovieTvProviderEngine(null);
    setAiJudgeFactory(null);
    await prisma.storyFact.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.sourceItemEntity.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.providerEnrichment.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.providerCacheEntry.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.muteRule.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.intelligenceSettings.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.entity.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.sourceHealth.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.discoveryRun.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.sourceItem.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.storyCluster.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.contentSource.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.siteEditorialProfile.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.siteIntelligenceProfile.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.site.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--live")) {
    const windowArg = args.find((arg) => arg.startsWith("--window-hours="));
    const windowHours = windowArg ? Number.parseInt(windowArg.split("=")[1], 10) : 24;
    const tenants = await prisma.tenant.findMany({ where: { status: "active" }, select: { id: true, name: true }, take: 5 });
    if (tenants.length === 0) {
      console.log("No active tenants — nothing to report yet.");
      return;
    }
    for (const tenant of tenants) {
      const report = await buildIntelligenceReport(tenant.id, { windowHours });
      console.log(JSON.stringify({ tenant: tenant.name, ...report }, null, 2));
    }
    return;
  }
  await runSimulation();
}

main()
  .catch((error) => {
    console.error("intelligence-report failed", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
