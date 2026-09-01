// Adapter registry. Business services resolve adapters through here; custom
// adapters for future providers can be registered at runtime.

import type { ContentSourceType } from "@prisma/client";
import type { SourceAdapter } from "./types";
import { RssAdapter } from "./rss";
import { AtomAdapter } from "./atom";
import { HtmlAdapter } from "./html";
import { HtmlListingAdapter } from "./htmllist";
import { SitemapAdapter } from "./sitemap";
import { ApiAdapter } from "./api";
import { GraphqlAdapter } from "./graphql";
import { WebhookAdapter } from "./webhook";
import { ManualAdapter } from "./manual";
import { ImdbDatasetAdapter } from "./imdb";

const registry = new Map<ContentSourceType, SourceAdapter>([
  ["rss", new RssAdapter()],
  ["atom", new AtomAdapter()],
  ["html", new HtmlAdapter()],
  ["htmllist", new HtmlListingAdapter()],
  ["sitemap", new SitemapAdapter()],
  ["api", new ApiAdapter()],
  ["graphql", new GraphqlAdapter()],
  ["webhook", new WebhookAdapter()],
  ["manual", new ManualAdapter()],
  ["imdb", new ImdbDatasetAdapter()],
]);

/** Register a custom adapter (future provider families / overrides). */
export function registerSourceAdapter(type: ContentSourceType, adapter: SourceAdapter): void {
  registry.set(type, adapter);
}

export function getSourceAdapter(type: ContentSourceType): SourceAdapter {
  const adapter = registry.get(type);
  if (!adapter) {
    throw new Error(`unsupported_source_type ${type}`);
  }
  return adapter;
}

export function listAdapterTypes(): ContentSourceType[] {
  return Array.from(registry.keys());
}
