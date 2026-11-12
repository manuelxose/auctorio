// Sitemap-index child URLs must pass the same robots check as the parent endpoint.
// No live network: fetch is mocked for a TEST-NET IP-literal host.

import assert from "node:assert/strict";
import test from "node:test";
import { sampleCompetitorCoverage } from "../src/studio/competitors";

const HOST = "203.0.113.77";

test("a sitemap-index child disallowed by robots.txt is never fetched", async () => {
  const original = globalThis.fetch;
  const fetched: string[] = [];
  const xml = { "content-type": "application/xml" };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    fetched.push(url);
    if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /private/\n", { status: 200 });
    if (url === `https://${HOST}/sitemap.xml`) {
      return new Response(`<?xml version="1.0"?><sitemapindex><sitemap><loc>https://${HOST}/private/post-sitemap.xml</loc></sitemap><sitemap><loc>https://${HOST}/ok/post-sitemap.xml</loc></sitemap></sitemapindex>`, { status: 200, headers: xml });
    }
    if (url === `https://${HOST}/ok/post-sitemap.xml`) {
      return new Response(`<?xml version="1.0"?><urlset><url><loc>https://${HOST}/ok/some-long-article-title-here</loc></url></urlset>`, { status: 200, headers: xml });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  try {
    const sample = await sampleCompetitorCoverage(`https://${HOST}`, { feedUrl: null, sitemapUrl: `https://${HOST}/sitemap.xml` }, 10);
    assert.ok(!fetched.some((url) => url.includes("/private/")), "disallowed child was not fetched");
    assert.ok(fetched.includes(`https://${HOST}/ok/post-sitemap.xml`), JSON.stringify(fetched));
    assert.ok(sample.items.length > 0);
  } finally {
    globalThis.fetch = original;
  }
});
