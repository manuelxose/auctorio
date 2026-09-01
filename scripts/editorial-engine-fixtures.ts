// Deterministic end-to-end editorial engine fixtures (Phase 4).
//
// Runs the full production path against the local database:
//   DISCOVERY → CLUSTER → FACTS → ENRICHMENT → BRIEF → ARTICLE → QA
//   → PUBLICATION DECISION
//
// Uses the deterministic fake writer — no network, no LLM. Each fixture
// creates its own tenant and cleans up after itself.

import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { emptyDiscoveredItem } from "../src/studio/adapters/normalize";
import { upsertSourceItem } from "../src/studio/sources";
import { runIntelligencePipelineForItem } from "../src/studio/intelligence/pipeline";
import { registerMovieTvPlugin } from "../src/studio/domains/movie-tv/plugin";
import { setArticleWriterFactory } from "../src/studio/editorial-engine/writer-provider";
import { generateArticleFromCluster } from "../src/studio/editorial-engine/orchestrator";
import { FakeWriter } from "../tests/support/fake-editorial-writer";

const prisma = getPrismaClient();
registerMovieTvPlugin();
setArticleWriterFactory(() => new FakeWriter());

type Fixture = {
  tenantId: string;
  siteId: string;
  sourceA: string;
  sourceB: string;
};

function line(char = "─", width = 78): string {
  return char.repeat(width);
}

function section(title: string): void {
  console.log(`\n${line()}\n  ${title}\n${line()}`);
}

async function createFixture(seed: string): Promise<Fixture> {
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-k`), status: "active" },
  });
  const site = await prisma.site.create({
    data: {
      tenantId: tenant.id,
      key: seed,
      name: `${seed}-site`,
      type: "guiatv",
      locale: "es-ES",
      baseUrl: `https://${seed}.example.com`,
    },
  });
  await prisma.siteEditorialProfile.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      profileVersion: 1,
      topics: ["movies", "series", "streaming", "trailers"],
      categories: ["movies", "series"],
      taxonomy: [],
      audience: [],
      language: "es",
      location: [],
      editorialDescription: "fixture profile",
      contentGaps: [{ topic: "trailers", score: 0.7, reason: "no_existing_coverage" }],
      existingTitles: [],
      sitemapUrl: null,
      articleStats: { articleCount: 0, avgTitleTokens: 0 },
    },
  });
  await prisma.siteIndexedPage.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      url: `https://${seed}.example.com/guia-streaming`,
      title: "Guía de streaming: qué ver esta semana",
      crawlState: "extracted",
      wordCount: 1200,
      contentType: "guide",
    },
  });
  const sourceA = await prisma.contentSource.create({
    data: {
      tenantId: tenant.id, name: `${seed}-variety`, type: "rss",
      url: "https://variety.example/feed", domain: "variety.example",
      trustScore: 0.9, authorityScore: 0.9, language: "es", siteId: site.id,
    },
  });
  const sourceB = await prisma.contentSource.create({
    data: {
      tenantId: tenant.id, name: `${seed}-hollywood-reporter`, type: "rss",
      url: "https://hollywoodreporter.example/feed", domain: "hollywoodreporter.example",
      trustScore: 0.8, authorityScore: 0.8, language: "es", siteId: site.id,
    },
  });
  return { tenantId: tenant.id, siteId: site.id, sourceA: sourceA.id, sourceB: sourceB.id };
}

async function cleanupFixture(fixture: Fixture): Promise<void> {
  const tenantId = fixture.tenantId;
  await prisma.articleGeneration.deleteMany({ where: { tenantId } });
  await prisma.publicationAttempt.deleteMany({ where: { tenantId } });
  await prisma.publication.deleteMany({ where: { tenantId } });
  await prisma.publicationJob.deleteMany({ where: { tenantId } });
  await prisma.contentDerivative.deleteMany({ where: { tenantId } });
  await prisma.socialContent.deleteMany({ where: { tenantId } });
  await prisma.contentVersion.deleteMany({ where: { tenantId } });
  await prisma.contentProject.deleteMany({ where: { tenantId } });
  await prisma.storyFact.deleteMany({ where: { tenantId } });
  await prisma.sourceItemEntity.deleteMany({ where: { tenantId } });
  await prisma.providerEnrichment.deleteMany({ where: { tenantId } });
  await prisma.providerCacheEntry.deleteMany({ where: { tenantId } });
  await prisma.muteRule.deleteMany({ where: { tenantId } });
  await prisma.intelligenceSettings.deleteMany({ where: { tenantId } });
  await prisma.entity.deleteMany({ where: { tenantId } });
  await prisma.sourceHealth.deleteMany({ where: { tenantId } });
  await prisma.discoveryRun.deleteMany({ where: { tenantId } });
  await prisma.sourceItem.deleteMany({ where: { tenantId } });
  await prisma.storyCluster.deleteMany({ where: { tenantId } });
  await prisma.contentSource.deleteMany({ where: { tenantId } });
  await prisma.siteEditorialProfile.deleteMany({ where: { tenantId } });
  await prisma.siteIntelligenceProfile.deleteMany({ where: { tenantId } });
  await prisma.siteIndexedPage.deleteMany({ where: { tenantId } });
  await prisma.searchTarget.deleteMany({ where: { tenantId } });
  await prisma.site.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

function makeItem(overrides: Partial<ReturnType<typeof emptyDiscoveredItem>> = {}): ReturnType<typeof emptyDiscoveredItem> {
  const nonce = Math.random().toString(16).slice(2, 8);
  return emptyDiscoveredItem({
    externalId: `fx-${Math.random().toString(16).slice(2, 10)}`,
    canonicalUrl: `https://variety.example/fx-${Math.random().toString(16).slice(2, 8)}`,
    sourceUrl: null,
    title: "A sufficiently long fixture story headline",
    description: `Fixture description with nonce ${nonce}.`,
    cleanedText: `Fixture description with nonce ${nonce}.`,
    categories: ["movies"],
    language: "es",
    ...overrides,
  });
}

async function ingest(
  fixture: Fixture,
  sourceId: string,
  item: ReturnType<typeof makeItem>,
  score = 0.7,
): Promise<void> {
  const upserted = await upsertSourceItem(fixture.tenantId, sourceId, item);
  const itemId = upserted.sourceItemId;
  if (!itemId) {
    throw new Error("upsert failed");
  }
  await prisma.sourceItem.update({
    where: { id: itemId },
    data: { score, processingStatus: score >= 0.4 ? "candidate" : "parsed" },
  });
  await runIntelligencePipelineForItem(fixture.tenantId, itemId);
}

async function clusterFor(fixture: Fixture): Promise<{ id: string }> {
  const clusters = await prisma.storyCluster.findMany({
    where: { tenantId: fixture.tenantId, status: { not: "superseded" } },
    orderBy: { lastSeenAt: "desc" },
  });
  if (clusters.length === 0) {
    throw new Error("no cluster");
  }
  return clusters[0];
}

function printGeneration(label: string, generation: Record<string, unknown>): void {
  const qa = (generation.qaReport ?? {}) as Record<string, unknown>;
  const publication = (generation.publicationDecision ?? {}) as Record<string, unknown>;
  const brief = (generation.brief ?? {}) as Record<string, unknown>;
  const article = (generation.article ?? {}) as Record<string, unknown>;
  const seo = (generation.seo ?? {}) as Record<string, unknown>;
  const provenance = Array.isArray(generation.provenance) ? generation.provenance as unknown[] : [];

  console.log(`\n${label}`);
  console.log(`  decision         : ${generation.decision} — ${generation.decisionReason ?? ""}`);
  console.log(`  article type     : ${generation.articleType} · intent ${generation.searchIntent}`);
  console.log(`  brief angle      : ${brief.storyAngle ?? ""}`);
  console.log(`  primary keyword  : ${brief.primaryKeyword ?? ""}`);
  console.log(`  length target    : ${JSON.stringify(brief.targetLengthRange ?? {})}`);
  console.log(`  content warnings : ${JSON.stringify(brief.contentWarnings ?? [])}`);
  console.log(`  site value       : ${String(brief.uniqueValueProposition ?? "").slice(0, 140)}`);
  console.log(`  article title    : ${article.title ?? ""}`);
  console.log(`  article h1       : ${article.h1 ?? ""}`);
  console.log(`  seo title        : ${seo.seoTitle ?? ""}`);
  console.log(`  slug             : ${seo.slug ?? ""}`);
  console.log(`  structured data  : ${seo.structuredDataRecommendation ?? ""}`);
  console.log(`  provenance facts : ${provenance.length}`);
  console.log(`  QA score         : ${qa.score ?? "—"} · passed ${qa.passed ?? "—"}`);
  const criticals = Array.isArray(qa.criticalUnsupportedClaims) ? qa.criticalUnsupportedClaims as unknown[] : [];
  console.log(`  critical claims  : ${criticals.length}`);
  const dimensions = Array.isArray(qa.dimensions) ? qa.dimensions as Array<Record<string, unknown>> : [];
  console.log(`  QA dimensions    : ${dimensions.map((dimension) => `${dimension.dimension}=${dimension.score}`).join(" ")}`);
  console.log(`  pub decision     : ${publication.decision ?? "—"}`);
  const gates = Array.isArray(publication.gates) ? publication.gates as Array<Record<string, unknown>> : [];
  for (const gate of gates) {
    console.log(`    ${gate.passed ? "✓" : "✗"} ${gate.label} — ${gate.detail}`);
  }
}

async function main(): Promise<void> {
  const started = Date.now();
  console.log("AUCTORIO PHASE 4 — editorial engine fixtures (deterministic)");
  console.log(`started ${new Date().toISOString()}`);

  // ── Fixture 1: corroborated trailer news with enrichment ───────────────
  {
    section("FIXTURE 1 · corroborated trailer news → original article (review)");
    const fixture = await createFixture(`fx1-${Date.now()}`);
    try {
      const title = "Studio Drops First Trailer For The Horizon (2027) At CinemaCon";
      const publishedAt = new Date(Date.now() - 3_600_000).toISOString();
      await ingest(fixture, fixture.sourceA, makeItem({
        title, externalId: "fx1a",
        canonicalUrl: "https://variety.example/fx1a", publishedAt,
      }), 0.8);
      await ingest(fixture, fixture.sourceB, makeItem({
        title, externalId: "fx1b",
        canonicalUrl: "https://hollywoodreporter.example/fx1b", publishedAt,
      }), 0.8);

      const cluster = await clusterFor(fixture);
      const clusterRow = await prisma.storyCluster.findUnique({ where: { id: cluster.id } });
      console.log(`\nDISCOVERY → CLUSTER  : ${clusterRow?.sourceCount} sources, ${clusterRow?.verificationState}, diversity ${clusterRow?.sourceDiversity}`);

      const facts = await prisma.storyFact.findMany({ where: { tenantId: fixture.tenantId, clusterId: cluster.id } });
      console.log(`FACTS                 : ${facts.map((fact) => `[${fact.factKey}] ${fact.statement.slice(0, 40)}`).join(" · ")}`);

      const work = await prisma.entity.findFirst({
        where: { tenantId: fixture.tenantId, type: { in: ["movie", "tv_series", "creative_work"] } },
      });
      if (work) {
        await prisma.providerEnrichment.create({
          data: {
            tenantId: fixture.tenantId, entityId: work.id, providerKey: "tmdb",
            providerEntityId: "fx-tmdb", resourceType: "movie", title: work.name,
            releaseDate: new Date("2027-07-16"), matchMethod: "year_match", confidence: 0.9,
            data: { cast: ["Ana Vega"], crew: ["Carla Ruiz"], watchProviders: ["HBO Max"], rating: 7.8, genres: ["Sci-Fi"], overview: "Verified overview." },
          },
        });
        console.log(`ENRICHMENT            : tmdb → ${work.name} (2027-07-16, watchProviders=HBO Max)`);
      }

      const generation = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
      printGeneration("BRIEF → ARTICLE → QA → PUBLICATION DECISION", generation);
    } finally {
      await cleanupFixture(fixture);
    }
  }

  // ── Fixture 2: single-source casting rumor (attribution required) ──────
  {
    section("FIXTURE 2 · single-source casting rumor → attributed, never auto-published");
    const fixture = await createFixture(`fx2-${Date.now()}`);
    try {
      const title = "Rumor: Famous Director Attached To Secret DC Project";
      await ingest(fixture, fixture.sourceA, makeItem({
        title, externalId: "fx2",
        canonicalUrl: "https://variety.example/fx2",
        publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
      }), 0.6);
      const cluster = await clusterFor(fixture);
      const clusterRow = await prisma.storyCluster.findUnique({ where: { id: cluster.id } });
      console.log(`\nDISCOVERY → CLUSTER  : ${clusterRow?.verificationState}, ${clusterRow?.sourceCount} source(s)`);
      const generation = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
      printGeneration("BRIEF → ARTICLE → QA → PUBLICATION DECISION", generation);
    } finally {
      await cleanupFixture(fixture);
    }
  }

  // ── Fixture 3: conflicting news → uncertainty represented ──────────────
  {
    section("FIXTURE 3 · conflicting news → uncertainty is explicit, nothing invented");
    const fixture = await createFixture(`fx3-${Date.now()}`);
    try {
      const title = "Netflix Renews The Midnight Club For A Second Season";
      await ingest(fixture, fixture.sourceA, makeItem({
        title, externalId: "fx3a",
        canonicalUrl: "https://variety.example/fx3a", publishedAt: "2026-08-29T10:00:00Z",
      }), 0.7);
      await ingest(fixture, fixture.sourceB, makeItem({
        title, externalId: "fx3b",
        canonicalUrl: "https://hollywoodreporter.example/fx3b", publishedAt: "2026-08-31T10:00:00Z",
      }), 0.7);
      const cluster = await clusterFor(fixture);
      const clusterRow = await prisma.storyCluster.findUnique({ where: { id: cluster.id } });
      console.log(`\nDISCOVERY → CLUSTER  : ${clusterRow?.verificationState} (conflicting published_at)`);
      const generation = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
      printGeneration("BRIEF → ARTICLE → QA → PUBLICATION DECISION", generation);
    } finally {
      await cleanupFixture(fixture);
    }
  }

  // ── Fixture 4: release-date correction → article update engine ─────────
  {
    section("FIXTURE 4 · release-date correction → UPDATE EXISTING with version history");
    const fixture = await createFixture(`fx4-${Date.now()}`);
    try {
      const first = makeItem({
        title: "Untitled Sci-Fi Project (2027) Gets Official Release Date",
        externalId: "fx4", canonicalUrl: "https://variety.example/fx4",
        publishedAt: new Date(Date.now() - 24 * 3_600_000).toISOString(),
      });
      await ingest(fixture, fixture.sourceA, first, 0.7);
      const cluster = await clusterFor(fixture);
      const firstGeneration = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
      printGeneration("FIRST GENERATION (create_new)", firstGeneration);

      const corrected = makeItem({
        title: "Untitled Sci-Fi Project (2028) Gets Official Release Date",
        externalId: "fx4", canonicalUrl: "https://variety.example/fx4",
        publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
      });
      const upserted = await upsertSourceItem(fixture.tenantId, fixture.sourceA, corrected);
      if (upserted.sourceItemId) {
        await prisma.sourceItem.update({
          where: { id: upserted.sourceItemId },
          data: { score: 0.7, processingStatus: "candidate" },
        });
        await runIntelligencePipelineForItem(fixture.tenantId, upserted.sourceItemId);
      }
      console.log(`\nNEW VERIFIED FACT    : release_year 2027 → 2028 (same externalId, content updated)`);
      const secondGeneration = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
      printGeneration("SECOND GENERATION (update_existing)", secondGeneration);
      const versions = await prisma.contentVersion.count({ where: { projectId: (firstGeneration.project as { id: string })?.id } });
      console.log(`  version history     : ${versions} versions kept`);
    } finally {
      await cleanupFixture(fixture);
    }
  }

  // ── Fixture 5: irrelevant topic → site-match gate evidence ─────────────
  {
    section("FIXTURE 5 · irrelevant topic → low site fit, gate evidence visible");
    const fixture = await createFixture(`fx5-${Date.now()}`);
    try {
      await ingest(fixture, fixture.sourceA, makeItem({
        title: "Global Coffee Prices Rise Amid Supply Shortages",
        externalId: "fx5", canonicalUrl: "https://variety.example/fx5",
        categories: ["markets"],
        publishedAt: new Date(Date.now() - 48 * 3_600_000).toISOString(),
      }), 0.5);
      const cluster = await clusterFor(fixture);
      const generation = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
      printGeneration("BRIEF → ARTICLE → QA → PUBLICATION DECISION", generation);
    } finally {
      await cleanupFixture(fixture);
    }
  }

  console.log(`\n${line("=")}\nAll fixtures completed in ${Date.now() - started}ms (deterministic, cleaned up).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
