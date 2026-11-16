# STUDIO-04 hand-off to STUDIO-05 / STUDIO-06

Source: local DB, site guiaprogramaciontv.com, profile version 5, last full read 2026-11-13 17:54 UTC. Detection only; no approved strategy was edited.

## Topic profile (detected)
- Site type `tv-programming-guide`, language `es`, profile confidence 0.4 (low: evidence is a sample).
- Main topics: tv, programación, streaming, películas, series, canales, horario(s), plataformas, televisión, cine.
- Clusters are **content-type clusters**, not semantic topics: movies 141, series 110, channels 64, article 58, sports 5, streaming 2.
- Excluded topics: none set.

## Representativeness report
| Section | Analysed / found |
|---|---|
| /peliculas | 140 / 3692 (3.8 %) |
| /series | 109 / 407 (27 %) |
| /canales | 64 / 67 |
| /guias | 33 / 33 |
| /programas | 22 / 22 |
| /deportes | 4 / 6 |
| /programacion-tv | 3 / 4 |
Totals: 4245 found, 392 fetched, 387 analysed, 1 failed (404), 4 skipped. Movies remain 36 % of the sample versus 87 % of the inventory.
Excluded as utility (never crawled, never clusters): legal/info/account routes (`avisolegal`, `accesibilidad`, `politica-editorial`, privacy, cookies, contact, login…).

## Known limitations to account for
1. Content type comes from the URL only. `/programas/*` ("cuándo ver en TV" pages) is now typed `where-to-watch` (fixed 2026-11-14; existing rows keep `article` until recrawled/reprofiled). `/guias/*` are editorial guides and stay `article`. `/programacion-tv/*` is typed by suffix (series/movies) or `article`; I have not verified every path. Cluster size is not demand.
2. Crawl sampling is per route family, round-robin; it is a sample, not a census. `profile confidence` reflects that.
3. No Search Console data: nothing here implies Google indexation, volume or ranking.
4. Pillar -> cluster link is an alias (`pillarAliases`, +15 in relevance); pillars without `clusterSlug` match by normalised name only.
5. Pages larger than 5 MB fail with `page_too_large` (retriable); `/embed`, `/deportes/futbol/*`, `/programacion-tv/en-directo` are thin/live pages skipped as `low_content_or_blocked`.

## Links
- Acceptance record: `docs/acceptance/studio-04-site-intelligence-2026-11-13.md`
- Overview endpoint: `GET /v2/site-intelligence/:siteId` (additive `evidence` field).
- Studio: Site intelligence > Coverage tab.
