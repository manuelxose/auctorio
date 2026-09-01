// Content-intelligence Phase 1 tests: normalized parsing, dedup signals,
// cross-publisher clustering, health/circuit/limiter/retry primitives.
// No live publisher websites — fixtures only.

import assert from "node:assert/strict";
import test from "node:test";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import {
  buildNormalizedTitleHash,
  buildCanonicalUrlHash,
  normalizeTitleForFingerprint,
  emptyDiscoveredItem,
} from "../src/studio/adapters/normalize";
import { parseRssItems } from "../src/studio/adapters/rss";
import { parseAtomItems } from "../src/studio/adapters/atom";
import { parseSitemapItems } from "../src/studio/adapters/sitemap";
import { parseHtmlArticle } from "../src/studio/adapters/html";
import { parseApiItems } from "../src/studio/adapters/api";
import { parseRobotsTxt, isPathAllowedByRules } from "../src/studio/adapters/http";
import { classifyMatch, evaluateDedup } from "../src/studio/deduplication";
import { upsertSourceItem, fetchSourceNow, listDueSources } from "../src/studio/sources";
import { assignSourceItemToCluster, extractEntityCandidates, refreshClusterAggregates } from "../src/studio/editorial";
import { CircuitBreaker } from "../src/studio/resilience/breaker";
import { SourceRateLimiter, DomainThrottle } from "../src/studio/resilience/limiter";
import { computeBackoffDelayMs, isTransientError, jitteredDelayMs, retryWithBackoff } from "../src/studio/resilience/retry";
import { computeHealthStatus, getSourceBreaker } from "../src/studio/source-health";
import { validateScrapeUrl } from "../src/infrastructure/scraping";
import { getDiscoveryMetrics } from "../src/studio/discovery-run";

const prisma = getPrismaClient();

// ── Fixtures

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>News</title><language>es</language>
  <item>
    <title>Estreno de la serie X anunciado</title>
    <link>https://news.example.com/estreno-serie-x?utm_source=feed&amp;utm_medium=rss</link>
    <description><![CDATA[<p>La plataforma anunció el estreno.</p>]]></description>
    <pubDate>Mon, 25 Aug 2026 10:00:00 GMT</pubDate>
    <dc:creator>Ana Pérez</dc:creator>
    <category>Series</category>
    <guid>https://news.example.com/id/1</guid>
  </item>
  <item>
    <title>Segunda noticia del día</title>
    <link>https://news.example.com/segunda</link>
    <description>Texto plano</description>
  </item>
  <item><description>Sin título</description></item>
</channel></rss>`;

const ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="es">
  <entry>
    <title>Crítica de la película Y</title>
    <link href="https://film.example.com/critica-y"/>
    <published>2026-08-24T09:00:00Z</published>
    <updated>2026-08-25T11:00:00Z</updated>
    <summary type="html">&lt;p&gt;Una gran película.&lt;/p&gt;</summary>
    <author><name>Luis Gómez</name></author>
    <category term="Cine"/>
  </entry>
</feed>`;

const NEWS_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  <url>
    <loc>https://news.example.com/noticias/gran-evento-2026</loc>
    <lastmod>2026-08-25</lastmod>
    <news:news>
      <news:publication>
        <news:name>El Periódico</news:name>
        <news:language>es</news:language>
      </news:publication>
      <news:publication_date>2026-08-25T08:00:00Z</news:publication_date>
      <news:title>Gran evento anunciado para 2026</news:title>
      <news:keywords>cine, streaming</news:keywords>
    </news:news>
  </url>
</urlset>`;

// ── Normalization

test("normalized title fingerprint is case/punctuation/diacritic-insensitive", () => {
  const first = normalizeTitleForFingerprint("  EL ESTRENO de Duna: ¡Ya Tiene Fecha!");
  const second = normalizeTitleForFingerprint("el estreno de duna ya tiene fecha");
  assert.equal(first, second);
  assert.equal(buildNormalizedTitleHash(first), buildNormalizedTitleHash(second));
  assert.notEqual(buildNormalizedTitleHash("otro titular distinto"), buildNormalizedTitleHash(first));
});

test("canonical URL hash is stable and normalized", () => {
  assert.equal(
    buildCanonicalUrlHash("https://EXAMPLE.com/path?utm_source=x#frag"),
    buildCanonicalUrlHash("https://example.com/path"),
  );
  assert.equal(buildCanonicalUrlHash("not a url"), null);
});

// ── Adapter parsing (fixtures, no network)

test("parseRssItems extracts normalized items from RSS", () => {
  const items = parseRssItems(RSS_XML, "https://news.example.com/feed", 20);
  assert.equal(items.length, 2);
  const first = items[0];
  assert.equal(first.title, "Estreno de la serie X anunciado");
  assert.equal(first.canonicalUrl, "https://news.example.com/estreno-serie-x");
  assert.equal(first.author, "Ana Pérez");
  assert.deepEqual(first.authors, ["Ana Pérez"]);
  assert.deepEqual(first.categories, ["Series"]);
  assert.equal(first.language, "es");
  assert.equal(first.publishedAt, "2026-08-25T10:00:00.000Z");
  assert.equal(first.rawText?.includes("estreno"), true);
  assert.equal(first.description, "La plataforma anunció el estreno.");
  assert.deepEqual(first.rawMetadata, { guid: "https://news.example.com/id/1", guidIsPermaLink: true, feedUrl: "https://news.example.com/feed", resolvedFromRelative: true });
});

test("parseAtomItems extracts normalized items from Atom", () => {
  const items = parseAtomItems(ATOM_XML, "https://film.example.com/feed", 20);
  assert.equal(items.length, 1);
  const entry = items[0];
  assert.equal(entry.title, "Crítica de la película Y");
  assert.equal(entry.canonicalUrl, "https://film.example.com/critica-y");
  assert.equal(entry.author, "Luis Gómez");
  assert.equal(entry.publishedAt, "2026-08-24T09:00:00.000Z");
  assert.equal(entry.modifiedAt, "2026-08-25T11:00:00.000Z");
  assert.deepEqual(entry.categories, ["Cine"]);
});

test("parseSitemapItems reads Google News sitemap metadata", () => {
  const items = parseSitemapItems(NEWS_SITEMAP_XML, "https://news.example.com/sitemap.xml", 20);
  assert.equal(items.length, 1);
  const entry = items[0];
  assert.equal(entry.title, "Gran evento anunciado para 2026");
  assert.equal(entry.canonicalUrl, "https://news.example.com/noticias/gran-evento-2026");
  assert.equal(entry.publishedAt, "2026-08-25T08:00:00.000Z");
  assert.equal(entry.author, "El Periódico");
  assert.deepEqual(entry.tags, ["cine", "streaming"]);
  assert.equal(entry.language, "es");
  assert.equal(entry.rawMetadata?.newsSitemap, true);
});

test("parseSitemapItems handles classic sitemaps without news metadata", () => {
  const xml = `<?xml version="1.0"?><urlset><url><loc>https://a.example/page-1</loc><lastmod>2026-08-20</lastmod></url></urlset>`;
  const items = parseSitemapItems(xml, "https://a.example/sitemap.xml", 20);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "page 1");
  assert.equal(items[0].rawMetadata?.newsSitemap, false);
});

test("malformed XML raises a contract error instead of leaking garbage", () => {
  assert.throws(() => parseRssItems("<rss><channel><item><title>roto", "https://x.example/feed", 20), /source_xml_invalid/);
});

test("invalid HTML still yields a normalized document without scripts", () => {
  const document = parseHtmlArticle("<div>garbage <<<>><script>alert(1)</script><h1>Hola</h1><p>Texto válido aquí.</p>", "https://x.example/a");
  assert.equal(document.title, "Hola");
  assert.equal(document.text?.includes("Texto válido"), true);
  assert.equal(document.text?.includes("alert(1)"), false);
});

test("parseApiItems maps JSON through configuration paths", () => {
  const json = {
    data: {
      posts: [
        { headline: "Post uno", url: "https://api.example.com/1", published_at: "2026-08-20T10:00:00Z", category: "Tech" },
        { headline: "Post dos", url: "https://api.example.com/2" },
      ],
    },
  };
  const items = parseApiItems(json, "https://api.example.com/posts", 20, {
    itemsPath: "data.posts",
    fields: { title: "headline", url: "url", publishedAt: "published_at", categories: "category" },
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Post uno");
  assert.deepEqual(items[0].categories, ["Tech"]);
  assert.equal(items[0].publishedAt, "2026-08-20T10:00:00.000Z");
});

// ── robots.txt

test("parseRobotsTxt extracts wildcard disallow rules", () => {
  const rules = parseRobotsTxt("User-agent: *\nDisallow: /private\nDisallow: /admin/\nUser-agent: googlebot\nDisallow: /nothing\n");
  assert.deepEqual(rules.disallow, ["/private", "/admin/"]);
});

test("robots rules block prefix paths and root", () => {
  const rules = parseRobotsTxt("User-agent: *\nDisallow: /\n");
  assert.equal(isPathAllowedByRules(rules, "/anything"), false);
  const partial = parseRobotsTxt("User-agent: *\nDisallow: /paywall\n");
  assert.equal(isPathAllowedByRules(partial, "/paywall/article"), false);
  assert.equal(isPathAllowedByRules(partial, "/public/article"), true);
});

// ── Dedup classification (pure)

test("classifyMatch marks changed content as an update", () => {
  const decision = classifyMatch("external_id", { contentHash: "a" }, { contentHash: "b" });
  assert.deepEqual(decision, { outcome: "duplicate", updated: true });
  const same = classifyMatch("external_id", { contentHash: "a" }, { contentHash: "a" });
  assert.deepEqual(same, { outcome: "duplicate", updated: false });
});

// ── DB-backed dedup + clustering

type DbFixture = { tenantId: string; sourceA: string; sourceB: string };

async function createDedupFixture(): Promise<DbFixture> {
  const seed = `ci-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-k`), status: "active" } });
  const sourceA = await prisma.contentSource.create({ data: { tenantId: tenant.id, name: `${seed}-a`, type: "rss", url: `https://a.example/feed`, trustScore: 0.9 } });
  const sourceB = await prisma.contentSource.create({ data: { tenantId: tenant.id, name: `${seed}-b`, type: "rss", url: `https://b.example/feed`, trustScore: 0.7 } });
  return { tenantId: tenant.id, sourceA: sourceA.id, sourceB: sourceB.id };
}

async function cleanupDedupFixture(fixture: DbFixture) {
  await prisma.sourceHealth.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.discoveryRun.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.sourceItem.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.storyCluster.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.contentSource.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.tenant.deleteMany({ where: { id: fixture.tenantId } });
}

function makeItem(overrides: Partial<ReturnType<typeof emptyDiscoveredItem>> = {}) {
  return emptyDiscoveredItem({
    externalId: "ext-1",
    canonicalUrl: "https://a.example/story-1",
    sourceUrl: "https://a.example/story-1",
    title: "Noticia de prueba suficientemente larga",
    description: "Descripción de la noticia de prueba.",
    cleanedText: "Descripción de la noticia de prueba.",
    categories: ["Cine"],
    ...overrides,
  });
}

test("dedup: same source + externalId is a duplicate item", async () => {
  const fixture = await createDedupFixture();
  try {
    const first = await upsertSourceItem(fixture.tenantId, fixture.sourceA, makeItem());
    assert.equal(first.created, true);

    const again = await upsertSourceItem(fixture.tenantId, fixture.sourceA, makeItem());
    assert.equal(again.created, false);
    assert.equal(again.updated, false);
    assert.equal(again.dedupReason, "source_external_id");

    const count = await prisma.sourceItem.count({ where: { tenantId: fixture.tenantId } });
    assert.equal(count, 1);
  } finally {
    await cleanupDedupFixture(fixture);
  }
});

test("dedup: content hash match within the window is a duplicate item", async () => {
  const fixture = await createDedupFixture();
  try {
    await upsertSourceItem(fixture.tenantId, fixture.sourceA, makeItem({ externalId: "a-1", canonicalUrl: "https://a.example/a-1" }));
    // Different source, different external id and URL, but identical content.
    const second = await upsertSourceItem(
      fixture.tenantId,
      fixture.sourceB,
      makeItem({ externalId: "b-1", canonicalUrl: "https://b.example/copy" }),
    );
    assert.equal(second.created, false);
    assert.equal(second.dedupReason, "content_hash");
  } finally {
    await cleanupDedupFixture(fixture);
  }
});

test("dedup: content hash older than the window is treated as a new item", async () => {
  const fixture = await createDedupFixture();
  try {
    const item = makeItem({ externalId: "old-1", canonicalUrl: "https://a.example/old-1" });
    const first = await upsertSourceItem(fixture.tenantId, fixture.sourceA, item);
    assert.equal(first.created, true);
    // Move the stored item outside the content-hash window.
    await prisma.sourceItem.update({
      where: { id: first.sourceItemId as string },
      data: { discoveredAt: new Date(Date.now() - 40 * 24 * 3_600_000) },
    });
    const second = await upsertSourceItem(
      fixture.tenantId,
      fixture.sourceB,
      makeItem({ externalId: "new-1", canonicalUrl: "https://b.example/new-1" }),
    );
    assert.equal(second.created, true);
  } finally {
    await cleanupDedupFixture(fixture);
  }
});

test("dedup: the same canonical URL across sources is a duplicate item", async () => {
  const fixture = await createDedupFixture();
  try {
    const first = await upsertSourceItem(fixture.tenantId, fixture.sourceA, makeItem({ externalId: "url-a", canonicalUrl: "https://shared.example/article" }));
    assert.equal(first.created, true);

    const second = await upsertSourceItem(
      fixture.tenantId,
      fixture.sourceB,
      makeItem({
        externalId: "url-b",
        canonicalUrl: "https://shared.example/article",
        title: "Titular completamente distinto para el mismo enlace",
        description: "Contenido distinto.",
        cleanedText: "Contenido distinto.",
      }),
    );
    assert.equal(second.created, false);
    assert.equal(second.dedupReason, "canonical_url");
  } finally {
    await cleanupDedupFixture(fixture);
  }
});

test("dedup: identical content in different tenants never collides", async () => {
  const fixtureA = await createDedupFixture();
  const fixtureB = await createDedupFixture();
  try {
    const first = await upsertSourceItem(fixtureA.tenantId, fixtureA.sourceA, makeItem({ externalId: "t-a" }));
    const second = await upsertSourceItem(fixtureB.tenantId, fixtureB.sourceA, makeItem({ externalId: "t-b" }));
    assert.equal(first.created, true);
    assert.equal(second.created, true);
  } finally {
    await cleanupDedupFixture(fixtureA);
    await cleanupDedupFixture(fixtureB);
  }
});

test("developing story update preserves raw metadata and bumps the cluster", async () => {
  const fixture = await createDedupFixture();
  try {
    const first = await upsertSourceItem(
      fixture.tenantId,
      fixture.sourceA,
      makeItem({ externalId: "dev-1", canonicalUrl: "https://a.example/dev-1", rawMetadata: { guid: "guid-1" } }),
    );
    assert.equal(first.created, true);
    const itemA = await prisma.sourceItem.findUnique({ where: { id: first.sourceItemId as string } });
    assert.ok(itemA);
    const assignment = await assignSourceItemToCluster(fixture.tenantId, itemA);
    assert.ok(assignment.cluster);

    // Same identity, changed content → update, not discard.
    const updated = await upsertSourceItem(
      fixture.tenantId,
      fixture.sourceA,
      makeItem({
        externalId: "dev-1",
        canonicalUrl: "https://a.example/dev-1",
        rawMetadata: { guid: "guid-1" },
        description: "Contenido actualizado de la noticia en desarrollo.",
        cleanedText: "Contenido actualizado de la noticia en desarrollo.",
      }),
    );
    assert.equal(updated.created, false);
    assert.equal(updated.updated, true);

    const stored = await prisma.sourceItem.findUnique({ where: { id: first.sourceItemId as string } });
    const metadata = stored?.metadata as Record<string, unknown>;
    assert.equal(metadata.guid, "guid-1");
    assert.equal(metadata.previousContentHash, itemA.contentHash);
    assert.equal(stored?.extractionStatus, "updated");

    const cluster = await prisma.storyCluster.findUnique({ where: { id: assignment.cluster.id } });
    assert.equal(cluster?.updateCount, 1);
  } finally {
    await cleanupDedupFixture(fixture);
  }
});

test("listDueSources skips sources with an open circuit breaker", async () => {
  const fixture = await createDedupFixture();
  try {
    const breaker = getSourceBreaker(fixture.tenantId, fixture.sourceA, null);
    const key = `${fixture.tenantId}:${fixture.sourceA}`;
    for (let index = 0; index < 5; index += 1) {
      await breaker.recordFailure(key);
    }
    const due = await listDueSources(fixture.tenantId);
    assert.equal(due.some((source) => source.id === fixture.sourceA), false);
    // The other source is still discoverable.
    assert.equal(due.some((source) => source.id === fixture.sourceB), true);
  } finally {
    await cleanupDedupFixture(fixture);
  }
});

test("source failure path increments failures and records a failed run", async () => {
  const fixture = await createDedupFixture();
  try {
    // Deterministic failure without network: invalid protocol rejected by SSRF.
    await prisma.contentSource.update({
      where: { id: fixture.sourceA },
      data: { url: "file:///etc/passwd", type: "rss" },
    });
    const result = await fetchSourceNow(fixture.tenantId, fixture.sourceA);
    assert.equal(result.failed, true);
    assert.match(result.error ?? "", /invalid_protocol/);

    const run = await prisma.discoveryRun.findUnique({ where: { id: result.runId } });
    assert.equal(run?.status, "failed");
    assert.equal(run?.sourceFailures, 1);

    const source = await prisma.contentSource.findUnique({ where: { id: fixture.sourceA } });
    assert.equal(source?.consecutiveFailures, 1);

    const health = await prisma.sourceHealth.findUnique({ where: { sourceId: fixture.sourceA } });
    assert.equal(health?.failedFetches, 1);
    assert.equal(health?.healthStatus, "degraded");
  } finally {
    await cleanupDedupFixture(fixture);
  }
});

test("retry honors an aborted signal as a timeout path", async () => {
  const controller = new AbortController();
  let calls = 0;
  const promise = retryWithBackoff(
    async () => {
      calls += 1;
      throw new Error("fetch_timeout after 100ms");
    },
    { attempts: 3, baseDelayMs: 100, jitterRatio: 0, signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(promise, /aborted|fetch_timeout/);
  assert.equal(calls, 1);
});

test("domain throttle throws after its deadline instead of hanging", async () => {
  const throttle = new DomainThrottle({ maxConcurrentPerDomain: 1, minIntervalMs: 0 });
  const blocker = throttle.run("y.example", () => new Promise<void>((resolve) => setTimeout(resolve, 120)), 500);
  await assert.rejects(throttle.run("y.example", async () => undefined, 40), /domain_throttle_timeout/);
  await blocker;
});

test("cross-publisher same headline is a story link, never a discard", async () => {
  const fixture = await createDedupFixture();
  try {
    const title = "El gran estreno del año ya tiene fecha oficial de lanzamiento";
    const first = await upsertSourceItem(
      fixture.tenantId,
      fixture.sourceA,
      makeItem({ externalId: "a-story", canonicalUrl: "https://a.example/story", title }),
    );
    assert.equal(first.created, true);

    // Real pipeline: the first item gets scored and clustered after its fetch.
    const itemA = await prisma.sourceItem.findUnique({ where: { id: first.sourceItemId as string } });
    assert.ok(itemA);
    const assignment = await assignSourceItemToCluster(fixture.tenantId, itemA);
    assert.ok(assignment.cluster);

    const second = await upsertSourceItem(
      fixture.tenantId,
      fixture.sourceB,
      makeItem({
        externalId: "b-story",
        canonicalUrl: "https://b.example/other-story",
        title,
        description: "Versión distinta del mismo acontecimiento cubierta por otro medio.",
        cleanedText: "Versión distinta del mismo acontecimiento cubierta por otro medio.",
      }),
    );
    // Same story from another publisher: KEPT and linked to the same cluster.
    assert.equal(second.created, true);
    assert.equal(second.dedupReason, "normalized_title");
    assert.equal(second.clusterLinkId, assignment.cluster.id);

    // Both items exist and share the cluster.
    const cluster = await prisma.storyCluster.findUnique({
      where: { id: assignment.cluster.id },
      include: { items: true },
    });
    assert.ok(cluster);
    assert.equal(cluster.items.length, 2);
    await refreshClusterAggregates(cluster.id);
    const refreshed = await prisma.storyCluster.findUnique({ where: { id: cluster.id } });
    assert.equal(refreshed?.sourceCount, 2);
    assert.equal(refreshed?.verificationState, "corroborated");
  } finally {
    await cleanupDedupFixture(fixture);
  }
});

test("cross-publisher clustering merges similar headlines into one event", async () => {
  const fixture = await createDedupFixture();
  try {
    const first = await upsertSourceItem(
      fixture.tenantId,
      fixture.sourceA,
      makeItem({
        externalId: "sim-a",
        canonicalUrl: "https://a.example/sim-a",
        title: "Nuevo tráiler de la película espacial presentado hoy en el festival",
      }),
    );
    assert.ok(first.sourceItemId);
    const second = await upsertSourceItem(
      fixture.tenantId,
      fixture.sourceB,
      makeItem({
        externalId: "sim-b",
        canonicalUrl: "https://b.example/sim-b",
        title: "Nuevo tráiler de la película espacial presentado hoy en el festival (vídeo)",
      }),
    );
    assert.ok(second.sourceItemId);

    const itemA = await prisma.sourceItem.findUnique({ where: { id: first.sourceItemId as string } });
    const itemB = await prisma.sourceItem.findUnique({ where: { id: second.sourceItemId as string } });
    assert.ok(itemA);
    assert.ok(itemB);

    const assignmentA = await assignSourceItemToCluster(fixture.tenantId, itemA);
    const assignmentB = await assignSourceItemToCluster(fixture.tenantId, itemB);

    assert.ok(assignmentA.cluster);
    assert.ok(assignmentB.cluster);
    assert.equal(assignmentA.cluster.id, assignmentB.cluster.id);
    assert.equal(assignmentA.created, true);
    assert.equal(assignmentB.created, false);

    const cluster = await prisma.storyCluster.findUnique({ where: { id: assignmentA.cluster.id } });
    assert.equal(cluster?.verificationState, "corroborated");
    assert.equal(cluster?.sourceCount, 2);
  } finally {
    await cleanupDedupFixture(fixture);
  }
});

test("cluster aggregates expose event-level intelligence fields", async () => {
  const fixture = await createDedupFixture();
  try {
    const first = await upsertSourceItem(
      fixture.tenantId,
      fixture.sourceA,
      makeItem({
        externalId: "agg-1",
        canonicalUrl: "https://a.example/agg-1",
        title: "Netflix anuncia la segunda temporada de su serie estrella",
        language: "es",
        categories: ["Series", "Streaming"],
      }),
    );
    assert.ok(first.sourceItemId);
    const item = await prisma.sourceItem.findUnique({ where: { id: first.sourceItemId as string } });
    assert.ok(item);
    await assignSourceItemToCluster(fixture.tenantId, item);

    const cluster = await prisma.storyCluster.findFirst({ where: { tenantId: fixture.tenantId } });
    assert.ok(cluster);
    assert.equal(cluster.verificationState, "unverified");
    assert.equal(cluster.confidence, 1);
    assert.ok((cluster.entityCandidates as string[]).length > 0);
    assert.ok((cluster.languages as string[]).includes("es"));
    assert.equal(cluster.authorityScore, 0.9);
    assert.ok(cluster.editorialValue !== null);
    assert.equal(cluster.primarySourceId, fixture.sourceA);
  } finally {
    await cleanupDedupFixture(fixture);
  }
});

test("extractEntityCandidates finds capitalized entities without domain assumptions", () => {
  const candidates = extractEntityCandidates([
    "Netflix anuncia su nueva serie con Pedro Almodóvar",
    "La serie de Pedro Almodóvar llega a Netflix en otoño",
  ]);
  assert.ok(candidates.some((entity) => entity.toLowerCase().includes("netflix")));
  assert.ok(candidates.some((entity) => entity.toLowerCase().includes("pedro almodóvar")));
  assert.equal(candidates.length <= 10, true);
});

// ── Discovery pipeline end-to-end (no network: webhook adapter)

test("fetchSourceNow records a discovery run and source health end-to-end", async () => {
  const fixture = await createDedupFixture();
  try {
    await prisma.contentSource.update({
      where: { id: fixture.sourceA },
      data: { type: "webhook", url: null },
    });
    const result = await fetchSourceNow(fixture.tenantId, fixture.sourceA);
    assert.equal(result.failed, false);
    assert.equal(result.fetched, 0);
    assert.ok(result.runId);

    const run = await prisma.discoveryRun.findUnique({ where: { id: result.runId } });
    assert.equal(run?.status, "succeeded");
    assert.equal(run?.adapterType, "webhook");
    assert.equal(run?.itemsFound, 0);

    const health = await prisma.sourceHealth.findUnique({ where: { sourceId: fixture.sourceA } });
    assert.equal(health?.healthStatus, "healthy");
    assert.equal(health?.totalFetches, 1);
    assert.equal(health?.successfulFetches, 1);
    assert.equal(health?.emptyFeeds, 1);

    // Metrics aggregation reflects the run.
    const metrics = await getDiscoveryMetrics(fixture.tenantId, 24);
    assert.equal(metrics.totalRuns >= 1, true);
    assert.equal(metrics.succeededRuns >= 1, true);
    assert.equal(typeof metrics.queueDepth, "number");
  } finally {
    await cleanupDedupFixture(fixture);
  }
});

test("fetchSourceNow skips a source with an open circuit breaker (no network)", async () => {
  const fixture = await createDedupFixture();
  try {
    const breaker = getSourceBreaker(fixture.tenantId, fixture.sourceA, null);
    const key = `${fixture.tenantId}:${fixture.sourceA}`;
    for (let index = 0; index < 5; index += 1) {
      await breaker.recordFailure(key);
    }
    const result = await fetchSourceNow(fixture.tenantId, fixture.sourceA);
    assert.equal(result.skipped, true);
    assert.equal(result.failed, false);
    assert.equal(result.error, "circuit_open");

    const run = await prisma.discoveryRun.findUnique({ where: { id: result.runId } });
    assert.equal(run?.status, "skipped");

    // The source was not fetched (lastFetchedAt untouched).
    const source = await prisma.contentSource.findUnique({ where: { id: fixture.sourceA } });
    assert.equal(source?.lastFetchedAt, null);
  } finally {
    await cleanupDedupFixture(fixture);
  }
});

test("per-source rate limiting marks excess fetches as skipped", async () => {
  const fixture = await createDedupFixture();
  try {
    await prisma.contentSource.update({
      where: { id: fixture.sourceA },
      data: { type: "webhook", url: null, rateLimitPolicy: { maxRequestsPerMinute: 1 } },
    });
    const first = await fetchSourceNow(fixture.tenantId, fixture.sourceA);
    assert.equal(first.failed, false);

    // Second fetch within the same minute must wait and then be skipped.
    process.env.SOURCE_RATE_LIMIT_WAIT_MS = "80";
    try {
      const second = await fetchSourceNow(fixture.tenantId, fixture.sourceA);
      assert.equal(second.skipped, true);
      assert.equal(second.error, "rate_limited");
    } finally {
      delete process.env.SOURCE_RATE_LIMIT_WAIT_MS;
    }

    const health = await prisma.sourceHealth.findUnique({ where: { sourceId: fixture.sourceA } });
    assert.equal(health?.rateLimitEvents, 1);
  } finally {
    await cleanupDedupFixture(fixture);
  }
});

// ── Resilience primitives

test("circuit breaker: closed → open → half-open → open", async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 20 });
  const key = "src:1";
  assert.equal(await breaker.state(key), "closed");
  await breaker.recordFailure(key);
  await breaker.recordFailure(key);
  assert.equal(await breaker.canAttempt(key), true);
  await breaker.recordFailure(key);
  assert.equal(await breaker.state(key), "open");
  assert.equal(await breaker.canAttempt(key), false);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(await breaker.state(key), "half_open");
  assert.equal(await breaker.canAttempt(key), true);
  await breaker.recordFailure(key);
  assert.equal(await breaker.state(key), "open");
  await breaker.recordSuccess(key);
  assert.equal(await breaker.state(key), "closed");
});

test("source rate limiter blocks bursts and respects deadlines", async () => {
  const limiter = new SourceRateLimiter();
  const policy = { maxRequests: 1, windowMs: 60_000 };
  assert.equal(await limiter.waitForSlot("s:1", policy, 30), true);
  assert.equal(await limiter.waitForSlot("s:1", policy, 30), false);
  // A second source is independent.
  assert.equal(await limiter.waitForSlot("s:2", policy, 30), true);
  // With capacity, min-interval still throttles.
  const intervalPolicy = { maxRequests: 10, minIntervalMs: 60_000 };
  assert.equal(await limiter.waitForSlot("s:3", intervalPolicy, 30), true);
  assert.equal(await limiter.waitForSlot("s:3", intervalPolicy, 30), false);
});

test("domain throttle serializes requests per hostname", async () => {
  const throttle = new DomainThrottle({ maxConcurrentPerDomain: 1, minIntervalMs: 0 });
  const order: number[] = [];
  const first = throttle.run("x.example", async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    order.push(1);
  });
  const second = throttle.run("x.example", async () => {
    order.push(2);
  });
  await Promise.all([first, second]);
  assert.deepEqual(order, [1, 2]);
});

test("retry with exponential backoff retries transient failures only", async () => {
  let attempts = 0;
  const value = await retryWithBackoff(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("fetch_failed status=503");
      }
      return "ok";
    },
    { attempts: 3, baseDelayMs: 5, maxDelayMs: 20, jitterRatio: 0 },
  );
  assert.equal(value, "ok");
  assert.equal(attempts, 3);

  // Non-transient errors fail fast.
  let calls = 0;
  await assert.rejects(
    retryWithBackoff(
      async () => {
        calls += 1;
        throw new Error("private_ip_blocked");
      },
      { attempts: 3, baseDelayMs: 5, jitterRatio: 0 },
    ),
    /private_ip_blocked/,
  );
  assert.equal(calls, 1);
});

test("backoff math is bounded and jitter stays within ratio", () => {
  assert.equal(computeBackoffDelayMs(1, { baseDelayMs: 1000, maxDelayMs: 30_000, factor: 2 }), 1000);
  assert.equal(computeBackoffDelayMs(2, { baseDelayMs: 1000, maxDelayMs: 30_000, factor: 2 }), 2000);
  assert.equal(computeBackoffDelayMs(10, { baseDelayMs: 1000, maxDelayMs: 30_000, factor: 2 }), 30_000);
  for (let index = 0; index < 50; index += 1) {
    const delay = jitteredDelayMs(1000, 0.2);
    assert.ok(delay >= 800 && delay <= 1200);
  }
});

test("isTransientError classifies timeouts, rate limits and 5xx", () => {
  assert.equal(isTransientError(new Error("fetch_timeout after 10000ms")), true);
  assert.equal(isTransientError(new Error("fetch_failed status=429")), true);
  assert.equal(isTransientError(new Error("fetch_failed status=502")), true);
  assert.equal(isTransientError(new Error("fetch_failed status=404")), false);
  assert.equal(isTransientError(new Error("private_ip_blocked")), false);
  const abort = new Error("aborted");
  abort.name = "AbortError";
  assert.equal(isTransientError(abort), true);
});

// ── Source health

test("computeHealthStatus transitions unknown → healthy → degraded → failing", () => {
  assert.equal(computeHealthStatus({ totalFetches: 0, consecutiveFailures: 0, circuitState: "closed" }), "unknown");
  assert.equal(computeHealthStatus({ totalFetches: 5, consecutiveFailures: 0, circuitState: "closed" }), "healthy");
  assert.equal(computeHealthStatus({ totalFetches: 5, consecutiveFailures: 1, circuitState: "closed" }), "degraded");
  assert.equal(computeHealthStatus({ totalFetches: 5, consecutiveFailures: 5, circuitState: "closed" }), "failing");
  assert.equal(computeHealthStatus({ totalFetches: 5, consecutiveFailures: 0, circuitState: "open" }), "failing");
});

// ── SSRF protection

test("validateScrapeUrl blocks private hosts and bad protocols", async () => {
  await assert.rejects(validateScrapeUrl(new URL("http://127.0.0.1/admin")), /private_ip_blocked/);
  await assert.rejects(validateScrapeUrl(new URL("http://169.254.169.254/latest/meta-data")), /private_ip_blocked/);
  await assert.rejects(validateScrapeUrl(new URL("http://10.0.0.5/")), /private_ip_blocked/);
  await assert.rejects(validateScrapeUrl(new URL("http://localhost/feed")), /invalid_host/);
  await assert.rejects(validateScrapeUrl(new URL("file:///etc/passwd")), /invalid_protocol/);
});

test.after(async () => {
  await prisma.$disconnect();
});
