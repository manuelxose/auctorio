# Auctorio Source Registry Architecture (Phase 2)

Production source registry, RSS/API discovery and publisher integration on top
of the Phase 1 SourceAdapter / Content Intelligence infrastructure.

## Layers

```
Studio (Angular sources page)
   │  /v2/source-packs · /v2/feed-discovery/discover · /v2/sources/bulk
   │  /v2/sources/:id/{verify,runs,mark-unsupported} · /v2/enrichment-providers
   ▼
routes-source-registry.ts + routes-editorial.ts  (auth, redaction)
   ▼
source-registry.ts (packs, import, bulk, verify, UI health)
enrichment-providers.ts (provider CRUD, secret refs, live tests)
feed-discovery.ts (link-alternate / common paths / robots / sitemaps)
   ▼
sources.ts (fetchSourceNow: breaker → rate limit → adapter → dedup → score →
            health → run; conditional-request state persistence; provenance)
   ▼
adapters/ (rss, atom, sitemap, api, html, htmllist, imdb, graphql, webhook,
           manual) — stateless, configuration-driven
   ▼
adapters/http.ts (SSRF, connect/headers/body timeouts, bounded redirects,
                  ETag/304, retry+jitter, per-domain throttle, rate-limit
                  headers) + resilience/ (breaker, limiter, retry, store)
```

## Registry vs packs vs providers

- **ContentSource** (DB) is the runtime source of truth. A registry entry maps
  1:1 to the fields requested (name, domain, adapter=type, endpoint, category,
  language, country, authority/trust, priority, refreshInterval, rateLimits,
  robotsPolicy, extractionPolicy, enabled, tags, packKey, verification…).
- **Source packs** (`source-packs/movie-tv-en.ts`) are reusable bootstrap
  configuration. Importing a pack creates ordinary rows and records the run in
  `source_pack_imports`. No publisher-specific code exists in business logic —
  the `movie-tv-en` pack is not hardcoded to any site.
- **EnrichmentProvider** (DB) is a structured-data API (TMDB, OMDb, YouTube
  Data API, IMDb official API) — strictly separate from editorial sources.
  `credentialsRef` stores an env-var NAME; the secret is resolved server-side
  only, never persisted, never serialized to the browser (`redactConfiguration`
  / `sanitizeSourceForClient`).

## Fetching policies (adapters/http.ts)

- Descriptive `User-Agent` (`auctorio-bot/1.0`, overridable).
- Connect timeout (`SOURCE_CONNECT_TIMEOUT_MS`) + headers/body timeouts via an
  undici `Agent`; total deadline enforced with an abort signal.
- Maximum body size (`SOURCE_FETCH_MAX_BYTES`) with explicit error.
- Redirects followed manually with a bound (`SOURCE_FETCH_MAX_REDIRECTS=5`);
  SSRF validation applies to every hop.
- Compression (gzip/deflate/br) handled transparently by undici.
- Conditional requests: adapters send `If-None-Match` / `If-Modified-Since`
  from the persisted `last_etag` / `last_modified_header`; a 304 becomes
  `SourceNotModifiedError` → adapters report `observed.notModified` →
  `fetchSourceNow` records a success without re-downloading and increments
  `not_modified_count`.
- Retry only retryable failures (429, 5xx, timeouts, transient socket errors)
  with exponential backoff + jitter; per-domain concurrency/politeness via
  `DomainThrottle`; `x-ratelimit-*` / `retry-after` headers captured and 429s
  counted as rate-limit events in source health.

## Parsing (adapters/rss.ts, atom.ts, sitemap.ts)

RSS 2.0/RDF, Atom, sitemaps and Google News sitemaps. Namespaces, CDATA,
`media:content`/`media:thumbnail`/`enclosure`, `content:encoded`, multiple
authors, categories (string/object/array), malformed optional fields, broken
RFC 822 dates (missing day-of-week tolerated), GUID variants (incl.
`isPermaLink="false"`), relative URLs resolved against the feed URL. All URLs
and dates are normalized at the source boundary.

## Safe article metadata extraction (adapters/html.ts)

Canonical URL, headline (OG → Twitter → JSON-LD → title → h1), deck,
author, publication/modification dates, hero image, schema.org JSON-LD,
OpenGraph, article section, and bounded body text. Third-party HTML is never
trusted: SSRF validation, body-size limits, timeouts, and sanitization are
enforced before parsing; raw payloads never cross the source boundary.

## Copyright and attribution (provenance.ts)

Every discovered item stores its provenance chain in `attribution`: publisher,
publisher domain, source feed URL, item URL, author, published date, retrieved
date, license and policy (`metadata-only`). The pipeline grounds facts and
links to the source; it does not reproduce third-party articles.

## Studio sources page

Tabs: Active sources · Source packs · Enrichment providers · AI
recommendations · Recently discovered · Blocked. Operators can add sources,
auto-discover feeds (verified candidates only — nothing auto-subscribes), test
connections with item previews, enable/disable, assign sites/categories/
language/refresh/trust/authority/tags, see concise health states
(Healthy/Delayed/Degraded/Rate limited/Broken/Disabled/Archived) with
diagnostics, trigger refreshes, verify endpoints, inspect recent discovery
runs, and run bulk operations. Advanced settings (rate limits, robots,
extraction policy, configuration JSON) live behind the Advanced section.
Secrets are never exposed.
