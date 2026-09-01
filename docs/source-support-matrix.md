# Auctorio — Source Support Matrix

Generated: 2026-08-31 · Pack: `movie-tv-en`

Every endpoint in this matrix was verified live on 2026-08-31 with user agent
`auctorio-bot/1.0` (HTTP 200 + parseable XML/JSON). A source is only labelled
"verified" when its current endpoint actually responded and parsed. Re-verify
anytime with:

```bash
npm run verify:sources:live -- --max 8     # first N entries
npm run verify:sources:live -- --all       # every entry incl. news sitemaps
```

## Editorial sources (RSS/Atom)

| SOURCE | ADAPTER | DISCOVERY METHOD | STATUS | LAST VERIFIED | RESTRICTIONS | NOTES |
|---|---|---|---|---|---|---|
| Deadline | rss | official_rss | verified | 2026-08-31 | — | Penske Media trade. `https://deadline.com/feed/` |
| Variety | rss | official_rss | verified | 2026-08-31 | — | Penske Media trade. `https://variety.com/feed/` |
| The Hollywood Reporter | rss | official_rss | verified | 2026-08-31 | — | Penske Media trade. `https://www.hollywoodreporter.com/feed/` |
| IndieWire | rss | official_rss | verified | 2026-08-31 | — | Penske Media. `https://www.indiewire.com/feed/` |
| Collider | rss | official_rss | verified | 2026-08-31 | — | Valnet. Content-Type is `application/xml`. `https://collider.com/feed/` |
| ScreenRant | rss | official_rss | verified | 2026-08-31 | — | Valnet. `https://screenrant.com/feed/` |
| MovieWeb | rss | official_rss | verified | 2026-08-31 | — | Valnet. `https://movieweb.com/feed/` |
| ComingSoon | rss | official_rss | verified | 2026-08-31 | — | Evolve Media. `https://www.comingsoon.net/feed` |
| Bloody Disgusting | rss | official_rss | verified | 2026-08-31 | — | Serves XML with `text/html` content-type; parser ignores content-type. `https://bloody-disgusting.com/feed/` |
| Slashfilm | rss | official_rss | verified | 2026-08-31 | — | Static Media. Feed returns `text/xml`. `https://www.slashfilm.com/feed/` |
| Den of Geek | rss | official_rss | verified | 2026-08-31 | — | `https://www.denofgeek.com/feed/` |
| CinemaBlend | rss | official_rss | verified | 2026-08-31 | — | Full-site RSS ~800 KB; `/feed` 404 — `/rss` is canonical. `https://www.cinemablend.com/rss` |
| The Playlist | rss | official_rss | verified | 2026-08-31 | Sitemaps 403 (Cloudflare) — feed only. | `https://theplaylist.net/feed/` |
| Empire | rss | link_alternate | verified | 2026-08-31 | Feed host is third-party `rss.onebauer.media` (Bauer Media aggregator); attribution to Empire/Bauer. | No direct RSS; discovered via `<link rel="alternate">` on Empire homepage. |
| BFI | rss | link_alternate | verified | 2026-08-31 | — | No `/feed` paths; discovered via `<link rel="alternate">` on BFI homepage. `https://www.bfi.org.uk/rss-feed` |
| Film Comment | rss | official_rss | verified | 2026-08-31 | — | Film at Lincoln Center. `https://www.filmcomment.com/feed/` |
| RogerEbert.com | rss | official_rss | verified | 2026-08-31 | Sitemaps 403 (Cloudflare) — feed only. | `https://www.rogerebert.com/feed/` |

## News sitemaps (optional entries, disabled by default)

| SOURCE | ADAPTER | DISCOVERY METHOD | STATUS | LAST VERIFIED | RESTRICTIONS | NOTES |
|---|---|---|---|---|---|---|
| Deadline — News sitemap | sitemap | news_sitemap | verified | 2026-08-31 | — | `https://deadline.com/news-sitemap.xml` (robots.txt declared) |
| Variety — News sitemap | sitemap | news_sitemap | verified | 2026-08-31 | — | `https://variety.com/news-sitemap.xml` (robots.txt declared) |
| The Hollywood Reporter — News sitemap | sitemap | news_sitemap | verified | 2026-08-31 | — | `https://www.hollywoodreporter.com/news-sitemap.xml` |
| IndieWire — News sitemap | sitemap | news_sitemap | verified | 2026-08-31 | — | `https://www.indiewire.com/news-sitemap.xml` (robots.txt declared) |
| Collider / ScreenRant / MovieWeb / ComingSoon / CinemaBlend — Google News sitemaps | sitemap | news_sitemap | verified (URLs confirmed in robots.txt) | 2026-08-31 | — | `post_google_news.xml` / `sitemap-news.xml` variants |

## Enrichment providers (structured-data APIs, independent from editorial sources)

| PROVIDER | ADAPTER | DISCOVERY METHOD | STATUS | LAST VERIFIED | RESTRICTIONS | NOTES |
|---|---|---|---|---|---|---|
| TMDB (api.themoviedb.org/3) | api (generic, config-driven) | official_api | verified | 2026-08-31 | Free-tier API key (`TMDB_API_KEY` env). Credentials never persisted in DB or returned to browser. | 401 without key; endpoint live. |
| OMDb (omdbapi.com) | api (generic, config-driven) | official_api | verified | 2026-08-31 | API key (`OMDB_API_KEY` env). | 401 without key; endpoint live. |
| YouTube Data API v3 | api (generic, config-driven) | official_api | verified | 2026-08-31 | Google Cloud API key (`YOUTUBE_API_KEY` env). | 403 without key; endpoint live. |
| IMDb Official API | api (generic, config-driven) | official_api | unsupported | 2026-08-31 | Licensed AWS Data Exchange product only — no public HTTP endpoint (`api.imdb.com` does not resolve). Marked unsupported until a license endpoint is configured. | `IMDB_API_KEY` env reference reserved. |

## Discovery preference order (applied per publisher)

1. official API
2. official RSS/Atom feed
3. official sitemap / news sitemap
4. publisher-supported endpoint
5. compliant HTML discovery only when necessary

No feed URLs were invented; stale URLs from old documentation were rejected.
Publishers whose endpoints cannot be legally/reliably automated are labelled
**unsupported** rather than scraped.
