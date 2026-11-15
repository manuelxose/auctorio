# STUDIO-05 — Sources, competitors and provenance: evidence (2026-11-15)

Branch `feat/editorial-operating-system`. Local environment, test site guiaprogramaciontv.com (`es-ES`). Commits: `dff5883`, `a34615d`, `bf01e58`, `549647a`, `c9f0138`, `87c3ffc`, `2feb508`, `dbac777`, `104518a`.

## Problems and root causes
| Problem | Class | Root cause |
|---|---|---|
| English movie feeds recommended to a Spanish TV guide | CONFIRMED CODE | Pack language mismatch was only a `limitations` note; score ignored language/country. Only pack `movie-tv-en` existed. |
| False competitors (`wa.me`, agency footer credits) | CONFIRMED CODE | Outbound links on sampled pages became candidates; `wa.me` was not in the non-competitor list; link-only hosts stayed shortlisted as speculative. |
| First-party sitemap never recommended | CONFIRMED CODE | First-party filter accepted only feeds/news sitemaps; GuíaTV exposes only a plain `sitemap.xml` (declared in robots.txt). |
| Source → plan evidence not traceable | CONFIRMED CODE | Planning evidence carried title/url only; plan items and drafts kept no `sourceId`/`itemId`. |
| Technical controls crowd the Sources screen | CONFIRMED CODE | Tabs were `1 Sources / 2 Recommendations / 3 Add / Settings`; no evidence view. |

## Changes
- `source-registry-discovery.ts`: pure `rankRecommendation` (relevance, trust, verification, first-party +20, language match +10 / mismatch −35 and relevance −1 level, country +5); factors stored in `evidence.ranking` and the assessment text. First-party verified full sitemaps are recommended with a limitation note.
- `source-packs/tv-streaming-es.ts` (new, registered in `source-registry.ts`): Vertele, Espinof, Fotogramas, Audiovisual451, Blogdecine, Xataka ON. All returned HTTP 200 with an `<rss>` body on 2026-11-14; disabled by default, robots respected, evidence/attribution only. Topic tags are ours.
- `competitors/index.ts`: chat/shortener/payment hosts added to the non-competitor list; search uses the site country; a candidate whose only evidence is outbound links, with no topic overlap, created in the same run, is dropped. Content mentions stay as speculative candidates (existing contract).
- Provenance: `getSourceEvidenceForPlanning` returns `sourceId`/`itemId`; `postValidatePlanItems` stamps them server-side on matching plan evidence (model-supplied ids are overwritten); `planEvidenceToLedger` keeps them as `LedgerFact.origin`; `materialize` writes `ContentProject.metadata.sourceOrigins` and defaults `sourceItemId`. No migration.
- Studio: tabs `Active sources / Suggestions / Evidence / Add / Advanced`; new Evidence view (`GET /v2/sites/:siteId/source-evidence`). Provider, blocked and discovered-domain controls are under Advanced.

## Live evidence (local, GuíaTV)
- Discovery: 27 recommendations. Spanish pack feeds scored 105–115 (e.g. `language es matches the site (+10); country ES matches the site (+5)`); English feeds (IndieWire, The Hollywood Reporter…) scored 65 (`language en differs from site language es (-35)`).
- Accept Vertele → fetch: 20 fetched, 20 created, 0 duplicates, 0 failed. Evidence lists them with `sourceId`/`itemId`.
- Screenshots: `docs/studio-rebuild/runtime/screens/studio-05-sources-{active,evidence,advanced-1024,advanced-390}.png`.

## Tests run
- Isolated DB `content_ai_test` (migrations applied): `sources-competitors` 6/6, `source-registry`, `source-quality` 9, `editorial-plan-v2` 16 — 53/53 in total.
- CMP-01 extended: `wa.me` and an unverifiable footer credit are never shortlisted. A first run on the main local DB caught my over-broad filter (it dropped content mentions); fixed in `dbac777`.
- Playwright (local, QA user): `sources-tabs` 1/1 (tabs, Evidence, Advanced, 1024 and 390 px), `sources-flow` 2/2 (accept → fetch → evidence; competitor reject/accept).
- `npm run typecheck`, `npm run build`, `npm run build:studio`.

## Verdicts
| Dimension | Verdict |
|---|---|
| IMPLEMENTATION | PARTIAL (no site-type classification beyond language/country; manual plan evidence gets no ids; origins live on the project, not each `ContentVersion`) |
| FUNCTIONALITY | PASS on local data (Spanish sources ranked first, traceable evidence, false competitors filtered) |
| UX/UI | PARTIAL (1440/1024/390 checked; no current-vs-changed pair for Suggestions and Active sources; `SourcesPage` not split further) |
| ACCESSIBILITY | PARTIAL (tabs are buttons in a labelled nav; no axe/screen-reader pass; at 390 px the tab strip scrolls horizontally) |
| SECURITY | PASS (SSRF-guarded fetch path unchanged; tenant filters unchanged; pack feeds only fetched on explicit discovery/accept) |
| INTEGRATION | PARTIAL (plan and production keep ids; Playwright flow is state-dependent) |
| REGRESSION | PARTIAL (targeted suites pass; no full `npm test`) |
| PRODUCTION READINESS | BLOCKED (local only; pack feed terms of use not reviewed; not deployed) |

## Not done / risks
- The competitor E2E depends on live discovery and local state; the `wa.me` assertion only proves it did not appear in that run — the data-layer test is the real guard.
- Pack topic tags and some inferred topics are noisy (an RTVE TV item tagged "movies"); they come from the site vocabulary.
- Local data left behind: Vertele accepted with 20 items, 27 recommendations, QA user `qa-sources@auctorio.test`, test tenants in `content_ai` and `content_ai_test`.
- Independent review skipped (owner instruction); no dedicated worktree.
- Handoff to STUDIO-06: evidence and verified opportunities carry `sourceId`/`itemId`; diagnostics panels live under Sources → Advanced (STUDIO-10).
