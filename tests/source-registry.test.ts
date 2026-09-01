// Phase 2 tests: source registry, hardened parsing, conditional requests
// (304), rate limiting (429), malformed feeds, duplicate items, canonical URL
// changes, feed discovery and enrichment providers. Fixtures only — no live
// third-party services. Network-dependent paths mock `globalThis.fetch`.

import assert from "node:assert/strict";
import test from "node:test";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { parseRssItems } from "../src/studio/adapters/rss";
import { parseAtomItems } from "../src/studio/adapters/atom";
import { parseSitemapItems } from "../src/studio/adapters/sitemap";
import { parseApiItems } from "../src/studio/adapters/api";
import { parseHtmlArticle, extractJsonLd } from "../src/studio/adapters/html";
import { fetchSourceHttp, SourceHttpError, SourceNotModifiedError } from "../src/studio/adapters/http";
import { RssAdapter } from "../src/studio/adapters/rss";
import { parseDate, resolveRelativeUrl } from "../src/studio/adapters/normalize";
import { extractFeedLinksFromHtml, extractSitemapUrlsFromRobots, verifyFeedCandidate } from "../src/studio/feed-discovery";
import { computeSourceUiHealth } from "../src/studio/source-registry";
import { buildProviderRequest, redactConfiguration } from "../src/studio/enrichment-providers";
import { buildProvenance, mergeProvenance } from "../src/studio/provenance";
import { upsertSourceItem } from "../src/studio/sources";
import type { DiscoveredSourceItem, DiscoveryContext } from "../src/studio/adapters/types";

const prisma = getPrismaClient();

// ── Fixtures ─────────────────────────────────────────────────────────────

const RSS_PUBLISHER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Example Publisher</title>
  <language>en</language>
  <item>
    <title><![CDATA[Studio Confirms "Dune 4" Start Date]]></title>
    <link>/movies/dune-4-start-date-2026/</link>
    <guid isPermaLink="false">article-998877</guid>
    <description><![CDATA[<p>The studio confirmed the production <strong>start date</strong>.</p>]]></description>
    <content:encoded><![CDATA[<p>Fuller syndication text with <a href="/movies/x">links</a>.</p>]]></content:encoded>
    <pubDate>28 Aug 2026 14:30:00 GMT</pubDate>
    <dc:creator>Jane Author</dc:creator>
    <category><![CDATA[Movies]]></category>
    <category domain="genre">Sci-Fi</category>
    <media:content url="https://cdn.example.com/dune4.jpg" medium="image"/>
    <media:thumbnail url="https://cdn.example.com/dune4-thumb.jpg"/>
    <enclosure url="https://cdn.example.com/dune4.mp4" type="video/mp4" length="1024"/>
  </item>
  <item>
    <title>Second Story</title>
    <atom:link href="https://www.example.com/second-story" rel="alternate"/>
    <pubDate>not-a-real-date</pubDate>
    <author>Some Editor (editor@example.com)</author>
  </item>
  <item><description>no title</description></item>
</channel>
</rss>`;

const ATOM_PUBLISHER_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xml:lang="en">
  <title>Example Film Journal</title>
  <entry>
    <title>Festival Lineup Revealed</title>
    <id>tag:example.com,2026:festival</id>
    <link rel="self" href="/feed/entry/1"/>
    <link rel="alternate" href="https://www.example.com/festival-lineup"/>
    <published>2026-08-20T09:00:00Z</published>
    <updated>2026-08-21T10:00:00Z</updated>
    <summary type="html">&lt;p&gt;The lineup was announced today.&lt;/p&gt;</summary>
    <author><name>First Critic</name></author>
    <author><name>Second Critic</name></author>
    <category term="Festivals"/>
    <category term="Indie"/>
    <media:thumbnail url="https://cdn.example.com/festival.jpg" width="640" height="360"/>
  </entry>
</feed>`;

const CLASSIC_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.example.com/a-review</loc><lastmod>2026-08-22</lastmod></url>
  <url><loc>https://www.example.com/b-news</loc><lastmod>2026-08-23</lastmod></url>
</urlset>`;

const NEWS_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  <url>
    <loc>https://www.example.com/news/scoop</loc>
    <news:news>
      <news:publication>
        <news:name>Example Publisher</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>2026-08-25T08:00:00Z</news:publication_date>
      <news:title>Big Scoop Announced</news:title>
      <news:keywords>movies, streaming</news:keywords>
    </news:news>
  </url>
</urlset>`;

const TMDB_LIKE_JSON = {
  page: 1,
  results: [
    {
      id: 9999,
      title: "Example Sequel",
      overview: "The gang returns for one last job.",
      release_date: "2026-12-18",
      poster_path: "/poster.jpg",
      media_type: "movie",
    },
    {
      id: 9998,
      title: "Example Prequel",
      overview: "How it all began.",
      release_date: "2026-11-04",
    },
  ],
};

const YOUTUBE_LIKE_JSON = {
  items: [
    {
      id: { videoId: "vid-123" },
      snippet: {
        title: "Trailer Reaction",
        description: "We react to the trailer.",
        publishedAt: "2026-08-24T12:00:00Z",
      },
    },
  ],
};

const HTML_WITH_ALTERNATE = `
<html><head>
  <title>Example</title>
  <link rel="alternate" type="application/rss+xml" title="RSS Feed" href="/feed/">
  <link rel="alternate" type="application/atom+xml" href="https://cdn.example.com/atom.xml">
  <link rel="alternate" href="/style.css">
</head><body></body></html>`;

const HTML_ARTICLE = `
<html lang="en"><head>
  <link rel="canonical" href="https://www.example.com/final-url" />
  <meta property="og:title" content="OG Headline" />
  <meta property="og:description" content="The deck text." />
  <meta property="og:image" content="https://cdn.example.com/hero.jpg" />
  <meta property="article:published_time" content="2026-08-25T08:00:00Z" />
  <meta property="article:modified_time" content="2026-08-26T09:00:00Z" />
  <meta property="article:section" content="Reviews" />
  <script type="application/ld+json">{"@type":"NewsArticle","headline":"JSON-LD Headline","author":{"@type":"Person","name":"J. Writer"},"articleSection":"Film","datePublished":"2026-08-25T09:00:00Z"}</script>
</head><body><article><h1>Visible H1</h1><p>Body paragraph.</p><img src="/inline.jpg"></article></body></html>`;

// ── Helpers ──────────────────────────────────────────────────────────────

function item(overrides: Partial<DiscoveredSourceItem>): DiscoveredSourceItem {
  return {
    externalId: "test-id",
    canonicalUrl: null,
    sourceUrl: null,
    title: "Default Title",
    description: null,
    rawText: null,
    cleanedText: null,
    author: null,
    authors: [],
    publishedAt: null,
    modifiedAt: null,
    sourceImageUrls: [],
    language: null,
    categories: [],
    tags: [],
    rawMetadata: null,
    attribution: null,
    confidence: null,
    ...overrides,
  };
}

function mockResponse(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(body || null, {
    status: init.status ?? 200,
    headers: { "content-type": "application/xml", ...(init.headers ?? {}) },
  });
}

// ── Feed parsing ─────────────────────────────────────────────────────────

test("parseRssItems handles namespaces, CDATA, media, content:encoded, GUID variants and relative URLs", () => {
  const items = parseRssItems(RSS_PUBLISHER_XML, "https://www.example.com/feed/", 20);
  assert.equal(items.length, 2);
  const first = items[0];

  assert.equal(first.title, 'Studio Confirms "Dune 4" Start Date');
  // Relative <link> resolved against the feed URL.
  assert.equal(first.canonicalUrl, "https://www.example.com/movies/dune-4-start-date-2026/");
  // Non-permalink GUID used as fallback identity metadata (kept, not treated as URL).
  assert.deepEqual((first.rawMetadata as Record<string, unknown>).guid, "article-998877");
  assert.equal((first.rawMetadata as Record<string, unknown>).guidIsPermaLink, false);
  // content:encoded preferred as the body, description as plain text.
  assert.ok(first.rawText?.includes("Fuller syndication text"));
  assert.equal(first.description, "The studio confirmed the production start date.");
  // Broken RFC 822 (no day-of-week) still parses.
  assert.equal(first.publishedAt, "2026-08-28T14:30:00.000Z");
  assert.deepEqual(first.authors, ["Jane Author"]);
  assert.deepEqual(first.categories, ["Movies", "Sci-Fi"]);
  // media:content + media:thumbnail + enclosure.
  assert.deepEqual(first.sourceImageUrls, [
    "https://cdn.example.com/dune4.jpg",
    "https://cdn.example.com/dune4-thumb.jpg",
    "https://cdn.example.com/dune4.mp4",
  ]);

  const second = items[1];
  // atom:link rel=alternate used when <link> is absent.
  assert.equal(second.canonicalUrl, "https://www.example.com/second-story");
  // Invalid pubDate is skipped, not fatal.
  assert.equal(second.publishedAt, null);
  // "Name (email)" author cleaned.
  assert.deepEqual(second.authors, ["Some Editor"]);
});

test("parseAtomItems handles multiple authors, alternate link preference and typed summary", () => {
  const items = parseAtomItems(ATOM_PUBLISHER_XML, "https://www.example.com/atom", 20);
  assert.equal(items.length, 1);
  const first = items[0];
  assert.equal(first.canonicalUrl, "https://www.example.com/festival-lineup");
  assert.deepEqual(first.authors, ["First Critic", "Second Critic"]);
  assert.equal(first.author, "First Critic");
  assert.deepEqual(first.categories, ["Festivals", "Indie"]);
  assert.equal(first.description, "The lineup was announced today.");
  assert.equal(first.publishedAt, "2026-08-20T09:00:00.000Z");
  assert.equal(first.modifiedAt, "2026-08-21T10:00:00.000Z");
  assert.deepEqual(first.sourceImageUrls, ["https://cdn.example.com/festival.jpg"]);
});

test("parseSitemapItems handles classic sitemaps", () => {
  const items = parseSitemapItems(CLASSIC_SITEMAP_XML, "https://www.example.com/sitemap.xml", 20);
  assert.equal(items.length, 2);
  assert.equal(items[0].canonicalUrl, "https://www.example.com/a-review");
  assert.equal(items[0].title, "a review");
  assert.equal(items[0].publishedAt, "2026-08-22T00:00:00.000Z");
});

test("parseSitemapItems handles Google News sitemaps", () => {
  const items = parseSitemapItems(NEWS_SITEMAP_XML, "https://www.example.com/news-sitemap.xml", 20);
  assert.equal(items.length, 1);
  const first = items[0];
  assert.equal(first.title, "Big Scoop Announced");
  assert.equal(first.author, "Example Publisher");
  assert.equal(first.language, "en");
  assert.deepEqual(first.tags, ["movies", "streaming"]);
  assert.equal(first.publishedAt, "2026-08-25T08:00:00.000Z");
});

test("parseApiItems maps a TMDB-like API provider through configuration", () => {
  const items = parseApiItems(TMDB_LIKE_JSON, "https://api.themoviedb.org/3/trending/movie/week", 20, {
    itemsPath: "results",
    fields: { id: "id", title: "title", description: "overview", publishedAt: "release_date", image: "poster_path" },
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].externalId, "9999");
  assert.equal(items[0].title, "Example Sequel");
  assert.equal(items[0].publishedAt, "2026-12-18T00:00:00.000Z");
  // URL mapping absent → no canonical URL, no crash.
  assert.equal(items[0].canonicalUrl, null);
});

test("parseApiItems maps a YouTube-like API provider with dotted paths", () => {
  const items = parseApiItems(YOUTUBE_LIKE_JSON, "https://www.googleapis.com/youtube/v3/search", 20, {
    itemsPath: "items",
    fields: { id: "id.videoId", title: "snippet.title", description: "snippet.description", publishedAt: "snippet.publishedAt" },
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].externalId, "vid-123");
  assert.equal(items[0].title, "Trailer Reaction");
  assert.equal(items[0].publishedAt, "2026-08-24T12:00:00.000Z");
});

test("malformed feed XML is rejected cleanly", () => {
  assert.throws(() => parseRssItems("<rss><channel>broken", "https://www.example.com/feed", 20), /source_xml_invalid/);
  assert.throws(() => parseAtomItems("not xml at all", "https://www.example.com/atom", 20), /source_xml_invalid/);
});

test("broken RFC 822 dates fall back gracefully", () => {
  assert.equal(parseDate("28 Aug 2026 14:30:00 GMT"), "2026-08-28T14:30:00.000Z");
  assert.equal(parseDate("garbage"), null);
  assert.equal(parseDate(null), null);
});

test("relative URLs resolve against a base and reject non-http schemes", () => {
  assert.equal(resolveRelativeUrl("https://www.example.com/feed/", "/movies/x"), "https://www.example.com/movies/x");
  assert.equal(resolveRelativeUrl("https://www.example.com/feed/", "movies/x"), "https://www.example.com/feed/movies/x");
  assert.equal(resolveRelativeUrl("https://www.example.com", "mailto:x@example.com"), null);
  assert.equal(resolveRelativeUrl("https://www.example.com", null), null);
});

// ── Article metadata extraction ──────────────────────────────────────────

test("parseHtmlArticle extracts canonical, OG, JSON-LD, section and images", () => {
  const document = parseHtmlArticle(HTML_ARTICLE, "https://www.example.com/original");
  assert.equal(document.url, "https://www.example.com/final-url");
  assert.equal(document.title, "OG Headline");
  assert.equal(document.description, "The deck text.");
  assert.equal(document.author, "J. Writer");
  assert.equal(document.publishedAt, "2026-08-25T08:00:00.000Z");
  assert.equal(document.modifiedAt, "2026-08-26T09:00:00.000Z");
  assert.equal(document.section, "Reviews");
  assert.ok(document.imageUrls.includes("https://cdn.example.com/hero.jpg"));
  assert.ok(document.imageUrls.includes("https://www.example.com/inline.jpg"));
  const jsonLd = extractJsonLd(HTML_ARTICLE);
  assert.equal(jsonLd.length, 1);
  assert.equal(jsonLd[0]["@type"], "NewsArticle");
});

// ── HTTP behavior (mocked fetch) ─────────────────────────────────────────

test("conditional request returns SourceNotModifiedError on 304 and adapters report notModified", async () => {
  const originalFetch = globalThis.fetch;
  const seenHeaders: string[] = [];
  try {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      seenHeaders.push(request.headers.get("if-none-match") ?? "");
      return mockResponse("", { status: 304 });
    }) as unknown as typeof fetch;

    const source = {
      id: "s1",
      type: "rss" as const,
      url: "https://www.example.com/feed/",
      endpoint: null,
      configuration: null,
      rateLimitPolicy: null,
      robotsPolicy: null,
      extractionPolicy: null,
      timezone: null,
      language: "en",
      domain: "www.example.com",
      lastEtag: '"abc123"',
      lastModifiedHeader: null,
    };
    const context: DiscoveryContext = { runId: "test-run", limits: {} };
    const items = await new RssAdapter().discover(source, context);
    assert.equal(items.length, 0);
    assert.equal(seenHeaders[0], '"abc123"');
    assert.equal(context.observed?.notModified, true);
    assert.equal(context.observed?.status, 304);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("429 responses are retryable and carry retry-after seconds", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => mockResponse("rate limited", { status: 429, headers: { "retry-after": "120" } }) as unknown as Response;
    await assert.rejects(
      () => fetchSourceHttp(new URL("https://www.example.com/api"), { accept: "application/json", retryAttempts: 1, robotsPolicy: undefined } as never),
      (error: unknown) => {
        assert.ok(error instanceof SourceHttpError);
        assert.equal((error as SourceHttpError).status, 429);
        assert.equal((error as SourceHttpError).retryable, true);
        assert.equal((error as SourceHttpError).retryAfterSeconds, 120);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rate-limit headers are captured on 200 responses", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      mockResponse('{"results":[]}', {
        status: 200,
        headers: { "content-type": "application/json", "x-ratelimit-remaining": "39", "x-ratelimit-reset": "9999999999" },
      }) as unknown as Response;
    const response = await fetchSourceHttp(new URL("https://www.example.com/api"), {
      accept: "application/json",
      retryAttempts: 1,
    } as never);
    assert.equal(response.rateLimit?.remaining, 39);
    assert.equal(response.rateLimit?.resetSeconds, 9999999999);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bounded redirects stop after the configured maximum", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response("moved", { status: 302, headers: { location: "/next" } }) as unknown as Response;
    await assert.rejects(
      () => fetchSourceHttp(new URL("https://www.example.com/start"), { accept: "text/html", retryAttempts: 1, maxRedirects: 2 } as never),
      (error: unknown) => error instanceof SourceHttpError && /too_many_redirects/.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verifyFeedCandidate verifies and parses a mocked RSS endpoint", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => mockResponse(RSS_PUBLISHER_XML, { status: 200 }) as unknown as Response;
    const result = await verifyFeedCandidate("https://www.example.com/feed/");
    assert.equal(result.verified, true);
    assert.equal(result.type, "rss");
    assert.equal(result.itemCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ── Feed discovery pure helpers ──────────────────────────────────────────

test("extractFeedLinksFromHtml finds rel=alternate feeds and resolves relative URLs", () => {
  const links = extractFeedLinksFromHtml(HTML_WITH_ALTERNATE, "https://www.example.com/");
  assert.equal(links.length, 2);
  const byUrl = new Map(links.map((link) => [link.url, link]));
  assert.equal(byUrl.get("https://www.example.com/feed/")?.type, "rss");
  assert.equal(byUrl.get("https://www.example.com/feed/")?.title, "RSS Feed");
  assert.equal(byUrl.get("https://cdn.example.com/atom.xml")?.type, "atom");
});

test("extractSitemapUrlsFromRobots reads declared sitemaps", () => {
  const body = [
    "User-agent: *",
    "Disallow: /admin",
    "",
    "Sitemap: https://www.example.com/sitemap.xml",
    "Sitemap: https://www.example.com/news-sitemap.xml",
  ].join("\n");
  assert.deepEqual(extractSitemapUrlsFromRobots(body), [
    "https://www.example.com/sitemap.xml",
    "https://www.example.com/news-sitemap.xml",
  ]);
});

// ── Health states ────────────────────────────────────────────────────────

test("computeSourceUiHealth maps sources to concise UI states", () => {
  const base = {
    enabled: true,
    archivedAt: null,
    healthStatus: "healthy",
    circuitState: "closed",
    lastFetchedAt: new Date(Date.now() - 60_000),
    lastSuccessAt: new Date(Date.now() - 60_000),
    refreshIntervalMinutes: 30,
    rateLimitEvents: 0,
    consecutiveFailures: 0,
    lastError: null,
  };
  assert.equal(computeSourceUiHealth({ ...base }).state, "healthy");
  assert.equal(computeSourceUiHealth({ ...base, lastFetchedAt: new Date(Date.now() - 3 * 60 * 60_000) }).state, "delayed");
  assert.equal(computeSourceUiHealth({ ...base, consecutiveFailures: 2, healthStatus: "degraded" }).state, "degraded");
  assert.equal(computeSourceUiHealth({ ...base, consecutiveFailures: 6 }).state, "broken");
  assert.equal(computeSourceUiHealth({ ...base, rateLimitEvents: 2, lastError: "fetch_failed status=429" }).state, "rate_limited");
  assert.equal(computeSourceUiHealth({ ...base, enabled: false }).state, "disabled");
  assert.equal(computeSourceUiHealth({ ...base, archivedAt: new Date() }).state, "archived");
});

// ── Provenance ───────────────────────────────────────────────────────────

test("buildProvenance records the attribution chain and mergeProvenance preserves existing data", () => {
  const provenance = buildProvenance(
    { name: "Example Publisher", domain: "www.example.com", url: "https://www.example.com/feed/" },
    item({ sourceUrl: "https://www.example.com/story", author: "A. Writer", publishedAt: "2026-08-25T00:00:00.000Z" }),
  );
  assert.equal(provenance.publisher, "Example Publisher");
  assert.equal(provenance.sourceUrl, "https://www.example.com/story");
  assert.equal(provenance.policy, "metadata-only");
  assert.ok(provenance.retrievedAt);

  const merged = mergeProvenance({ syndicatedFrom: "Partner" }, provenance);
  assert.equal(merged.syndicatedFrom, "Partner");
  assert.equal(merged.publisher, "Example Publisher");
});

// ── Enrichment providers (configuration-driven, no secrets to clients) ───

test("buildProviderRequest applies query-api-key and bearer schemes", () => {
  const provider = {
    baseUrl: "https://api.themoviedb.org/3",
    endpoint: "/trending/movie/week",
    configuration: { credentialScheme: "query_api_key", apiKeyParam: "api_key", defaultParams: { language: "en-US" } },
    credentialsRef: "TMDB_API_KEY",
  };
  const withKey = buildProviderRequest(provider, "secret-key");
  assert.equal(withKey.url, "https://api.themoviedb.org/3/trending/movie/week?language=en-US&api_key=secret-key");
  assert.deepEqual(withKey.headers, {});

  const withoutKey = buildProviderRequest(provider, null);
  assert.equal(withoutKey.url, "https://api.themoviedb.org/3/trending/movie/week?language=en-US");

  const bearer = buildProviderRequest({ ...provider, configuration: { credentialScheme: "bearer" } }, "token-123");
  assert.deepEqual(bearer.headers, { authorization: "Bearer token-123" });
});

test("redactConfiguration strips secret-shaped keys before serialization", () => {
  const redacted = redactConfiguration({
    itemsPath: "results",
    headers: { authorization: "Bearer SECRET", "x-api-key": "SECRET" },
    apiKey: "SECRET",
    safe: "keep",
  } as never);
  assert.deepEqual(redacted, {
    itemsPath: "results",
    headers: { authorization: "[redacted]", "x-api-key": "[redacted]" },
    apiKey: "[redacted]",
    safe: "keep",
  });
});

// ── Deduplication: duplicate item and canonical URL change ───────────────

test("duplicate feed item is deduplicated; canonical URL change updates the item", async () => {
  const seed = `phase2-dup-${Date.now()}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-k`), status: "active" } });
  const source = await prisma.contentSource.create({
    data: {
      tenantId: tenant.id,
      name: `Fixture Source ${seed}`,
      type: "rss",
      url: "https://www.example.com/feed/",
      domain: "www.example.com",
    },
  });

  try {
    const baseItem = item({
      externalId: "story-1",
      title: "Director Confirms Sequel",
      sourceUrl: "https://www.example.com/old-url",
      canonicalUrl: "https://www.example.com/old-url",
      publishedAt: "2026-08-25T08:00:00.000Z",
      cleanedText: "The sequel is confirmed.",
    });

    const first = await upsertSourceItem(tenant.id, source.id, baseItem);
    assert.equal(first.created, true);
    assert.ok(first.sourceItemId);

    // Identical re-fetch → duplicate.
    const duplicate = await upsertSourceItem(tenant.id, source.id, baseItem);
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.updated, false);
    assert.equal(duplicate.sourceItemId, first.sourceItemId);

    // Publisher moved the article: canonical URL changed, same externalId and
    // title → developing-story update, not a new item.
    const moved = await upsertSourceItem(tenant.id, source.id, {
      ...baseItem,
      sourceUrl: "https://www.example.com/new-url",
      canonicalUrl: "https://www.example.com/new-url",
      cleanedText: "The sequel is confirmed. Updated.",
    });
    assert.equal(moved.created, false);
    assert.equal(moved.updated, true);

    const stored = await prisma.sourceItem.findUnique({ where: { id: first.sourceItemId ?? "" } });
    assert.equal(stored?.canonicalUrl, "https://www.example.com/new-url");
    assert.equal(stored?.extractionStatus, "updated");
    const storedAttribution = stored?.attribution as Record<string, unknown> | null;
    assert.equal(storedAttribution?.publisher, `Fixture Source ${seed}`);
    assert.equal(storedAttribution?.sourceUrl, "https://www.example.com/new-url");
    assert.ok(storedAttribution?.retrievedAt);
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
});
