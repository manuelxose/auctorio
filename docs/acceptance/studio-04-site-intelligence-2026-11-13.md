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
| UX/UI | PARTIAL (Coverage and SEO signals verified at 1440; Opportunities only via E2E and unit tests, 1024/390 not re-captured for the new tabs) |
| ACCESSIBILITY | PARTIAL (keyboard operation of tabs verified in E2E; no axe/contrast/screen-reader pass) |
| SECURITY | PASS (SSRF/robots guards untouched; tenant filters unchanged) |
| INTEGRATION | PARTIAL (Plan CTA is the existing per-pillar link) |
| REGRESSION | PARTIAL (new E2E passes; no full `npm test`) |
| PRODUCTION READINESS | BLOCKED (local only; not deployed) |

## E2E
`e2e/specs/site-intelligence-coverage.spec.ts` (local, QA user, 2026-11-14): 1/1 passed. Checks keyboard activation of the Coverage tab, distinct discovered/fetched/analysed/failed counts, the "nothing about Google indexation" caveat, and that the inventory is titled "Discovered pages" (no "Indexed pages"). No Playwright trace was recorded.

## SEO signals and Opportunities (2026-11-14)
- Backend: pure `computeSeoSignals` / `computeOpportunities` in `signals.ts`, wired into the overview (`seoSignals`, `opportunities`, `opportunitiesBasis`). Facts only: counts over analysed editorial pages (utility pages excluded) with sample URLs; no volume, difficulty, ranking, click or indexation numbers.
- Opportunities are approved/suggested pillar subtopics that no analysed title/H1 mentions; confidence follows the share of discovered pages actually read (<10 % low, <50 % medium). With no pillars, the UI says so instead of claiming "no gaps". GuíaTV has no pillars locally, so the tab shows that explanation; the gap logic is covered by unit tests only, not by live data.
- Live data (399 analysed / 392 editorial of 4289): no meta description 0, no H1 2, under 300 words 225, no JSON-LD 8, canonical differs 3. Screenshot: `runtime/screens/studio-04-seo-signals-1440.jpg`.
- Two defects found and fixed while verifying: the extractor lost every H1 inside `<header>` (371/380 pages falsely "No H1"), and `upsertDiscoveredPages` demoted `stale` pages to `discovered`, hiding them from "analysed". To verify, 371 local pages were set to `stale` and recrawled; pages crawled before the fix keep a null H1 until re-extracted.
- E2E extended (SEO signals + Opportunities assertions): 1/1 passed. Unit tests: `site-intelligence` 18/18.

## Not done
Persistent crawl cursor (resume works via crawl state); unit test for `page_too_large`; E2E for strategy version/restore and the no-Search-Console state; axe/contrast/screen-reader audit; full `npm test` (runs migrations; needs an isolated DB); dedicated worktree; independent review (skipped per project preference); 1024/390 captures of the two new tabs; live demo of Opportunities with a real pillar.
