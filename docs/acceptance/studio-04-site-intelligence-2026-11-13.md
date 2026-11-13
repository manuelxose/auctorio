# STUDIO-04 — Site Intelligence: representative evidence (2026-11-13)

Branch `feat/editorial-operating-system`. Local environment, test site guiaprogramaciontv.com.

## Root causes (CONFIRMED CODE, verified on local data)
1. `crawlPagesForSite` ordered candidates by `crawlState, modifiedAt desc`, so the largest section (`/peliculas`) consumed the budget. Baseline: `/peliculas` 30/3684, `/series` 0/406, `/canales` 0/67.
2. Legal/info routes were typed `article` and became topic clusters.
3. `SITE_INTEL_MAX_PAGE_BYTES` default 1 MB; `/canales/*` pages are ~2.7 MB and were skipped with the misleading `low_content_or_blocked`.
4. UI labelled sitemap-inventoried URLs as "Indexed pages".
5. Approved strategy pillars did not alias to detected clusters in relevance scoring (+15 only on exact cluster match).

## Changes
- `crawler.ts`: `routeFamily`, `isUtilityUrl`, `selectStratified` (deterministic round-robin per route family, utility pages excluded); size cap 5 MB, oversize now fails with `page_too_large`.
- `profile.ts`: utility pages never create clusters (by stored type or URL).
- `index.ts`: overview exposes `evidence` (discovered / fetched / extracted / failed / skipped + per-section).
- `site-relevance.ts`, `editorial-plan-context.ts`: `pillarAliases`, auditable reason string.
- Studio: new **Coverage** tab; "Pages" panel renamed "Discovered pages (from sitemap; not Google-indexed)".
- No migration, no destructive reset. Recrawl writes `SiteIndexedPage`/`SiteTopicCluster`/profile only; `SiteEditorialStrategy` is never written by the crawl.

## Evidence (same site, full recrawl via Studio)
| Section | Before | After |
|---|---|---|
| /peliculas | 30 / 3684 | 140 / 3692 |
| /series | 0 / 406 | 109 / 407 |
| /canales | 0 / 67 | 64 / 67 |
| /guias | 1 / 33 | 33 / 33 |
| /programas | 0 / 14 | 22 / 22 |
| /deportes | 1 / 6 | 4 / 6 |
| /programacion-tv | 0 / 4 | 3 / 4 |

Totals after: 4245 found, 392 fetched, 387 analysed, 1 failed (404), 4 skipped. Remaining unanalysed: live/thin pages (`/embed`, `/deportes/futbol/*`, `/programacion-tv/en-directo`) and a few `/canales` URLs.
Screenshots checked in the browser pane at 1440 / 1024 / 390 (not stored as files).

## Tests run
`tests/site-intelligence.test.ts` 15/15, `tests/site-strategy.test.ts` 5/5, `tests/site-onboarding.test.ts` 7/7, `npm run typecheck`, `ng build`.
Note: `site-strategy` "concurrent strategy saves" failed once when run in parallel with the site-intelligence file against the same DB; it passes alone and on the baseline.

## Verdicts
| Dimension | Verdict |
|---|---|
| IMPLEMENTATION | PARTIAL |
| FUNCTIONALITY | PASS (acceptance criteria on local data) |
| UX/UI | PARTIAL (Coverage tab verified; no SEO-signals/Opportunities tabs) |
| ACCESSIBILITY | PARTIAL (no audit run) |
| SECURITY | PASS (SSRF/robots guards untouched; tenant filters unchanged) |
| INTEGRATION | PARTIAL (Plan CTA is the existing per-pillar link) |
| REGRESSION | PARTIAL (no full `npm test`, no E2E) |
| PRODUCTION READINESS | BLOCKED (local only; not deployed) |

## Not done
SEO signals and Opportunities tabs; persistent crawl cursor (resume works via crawl state); unit test for `page_too_large`; Playwright E2E for the Coverage tab; independent review (skipped per project preference); Spanish-only/UX copy review.
The `/v2/site-intelligence/:siteId` overview gains an additive `evidence` field; clients that ignore it are unaffected.
