// `tv-streaming-es` source pack: Spanish-market TV, series and streaming editorial feeds.
// Every endpoint returned HTTP 200 with an <rss> body on 2026-11-14 (auctorio-bot user agent).
// Ingestion is evidence/attribution only; republication is not granted.

import type { SourcePackDefinition, SourcePackEntry } from "./types";

const entry = (id: string, name: string, domain: string, endpoint: string, tags: string[], trust: number, notes: string): SourcePackEntry => ({
  id,
  name,
  domain,
  adapter: "rss",
  endpoint,
  discoveryMethod: "official_rss",
  category: "tv-streaming",
  language: "es",
  country: "ES",
  authority: trust,
  trust,
  priority: 10,
  refreshIntervalMinutes: 60,
  rateLimits: { maxRequestsPerMinute: 6, minIntervalMs: 10000 },
  robotsPolicy: { respect: true },
  extractionPolicy: { respectCopyright: true, extractArticleMetadataOnly: true },
  enabled: false,
  tags,
  notes: `${notes} RSS verified 2026-11-14.`,
});

export const TV_STREAMING_ES_PACK: SourcePackDefinition = {
  key: "tv-streaming-es",
  name: "TV y streaming — fuentes editoriales en español",
  description: "Bootstrap configuration for Spanish-language TV, series and streaming editorial feeds (RSS). Optional pack; the database remains the runtime source of truth after import.",
  category: "tv-streaming",
  language: "es",
  country: "ES",
  optional: true,
  entries: [
    entry("vertele", "Vertele", "vertele.eldiario.es", "https://vertele.eldiario.es/rss/", ["television", "tv", "series", "programas", "audiencias"], 0.8, "Television section of elDiario.es."),
    entry("espinof", "Espinof", "espinof.com", "https://www.espinof.com/index.xml", ["cine", "series", "television", "streaming", "peliculas"], 0.8, "Weblogs SL film and series blog."),
    entry("fotogramas", "Fotogramas", "fotogramas.es", "https://www.fotogramas.es/rss/all.xml", ["cine", "series", "television", "streaming", "peliculas"], 0.8, "Hearst Spain film and series magazine."),
    entry("audiovisual451", "Audiovisual451", "audiovisual451.com", "https://www.audiovisual451.com/feed/", ["television", "streaming", "audiovisual", "series", "plataformas"], 0.7, "Spanish audiovisual industry news."),
    entry("blogdecine", "Blogdecine", "blogdecine.com", "https://www.blogdecine.com/index.xml", ["cine", "peliculas", "series", "estrenos"], 0.7, "Weblogs SL film blog."),
    entry("xataka-on", "Xataka ON", "xatakaon.com", "https://www.xatakaon.com/index.xml", ["streaming", "series", "television", "plataformas", "peliculas"], 0.7, "Xataka streaming and series section."),
  ],
  providers: [],
};
