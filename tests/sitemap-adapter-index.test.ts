// A sitemap source pointing at a sitemap index must yield the pages of its child
// sitemaps, never the child sitemap files themselves. No live network.

import assert from "node:assert/strict";
import test from "node:test";
import { SitemapAdapter } from "../src/studio/adapters/sitemap";
import type { SourceRef } from "../src/studio/adapters/types";

const HOST = "203.0.113.78";

test("sitemap index sources expand child sitemaps into page items", async () => {
  const original = globalThis.fetch;
  const xml = { "content-type": "application/xml" };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200 });
    if (url === `https://${HOST}/sitemap.xml`) {
      return new Response(
        `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://${HOST}/blog.xml</loc><lastmod>2026-11-10</lastmod></sitemap><sitemap><loc>https://${HOST}/broken.xml</loc></sitemap></sitemapindex>`,
        { status: 200, headers: xml },
      );
    }
    if (url === `https://${HOST}/blog.xml`) {
      return new Response(
        `<?xml version="1.0"?><urlset><url><loc>https://${HOST}/blog/series-estreno-noviembre</loc><lastmod>2026-11-10</lastmod></url></urlset>`,
        { status: 200, headers: xml },
      );
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  try {
    const source = { id: "s1", type: "sitemap", url: `https://${HOST}/sitemap.xml`, configuration: {} } as unknown as SourceRef;
    const items = await new SitemapAdapter().discover(source, { runId: "t", limits: {} as never, policies: { retryAttempts: 0 } });
    assert.deepEqual(items.map((item) => item.canonicalUrl), [`https://${HOST}/blog/series-estreno-noviembre`]);
    assert.ok(items.every((item) => item.rawMetadata?.sitemapIndexEntry !== true));
  } finally {
    globalThis.fetch = original;
  }
});
