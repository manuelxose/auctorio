# GuiaTV acceptance, local stack, 2026-11-12

Branch `feat/editorial-operating-system`. Everything below was observed against the local API; nothing was written to guiaprogramaciontv.com (public pages were only crawled through the app's own crawler and the RSS/competitor fetchers).

## Environment

- Local Postgres and Redis (docker), dev DB `content_ai`, API started by hand on `127.0.0.1:4312` (`scripts/start-api.ts`, in-process). No separate worker was needed: onboarding, plan generation, source fetch and the production pipeline all ran inside the API process.
- Tenant: the existing local workspace `auctorio` (`7f97722d-...`). Its `AiProviderSetting` selects **DeepSeek / `deepseek-chat`** (key read from the environment by the app, never printed). Plan generation and article writing both reported `provider: deepseek, model: deepseek-chat`. `.env` still has `TEXT_PROVIDER=mock`; the per-workspace choice overrides it.
- Auth: a new local user `acceptance.guiatv@auctorio.localhost` (role `admin`, 9 permissions) was invited and activated in that tenant; requests were signed the same way the Studio proxy signs them (`x-studio-*` headers, HMAC with the dev shared secret). Credentials live only in the git-ignored `.claude/acceptance-credentials.local.json`. No existing user was touched.
- Site: no GuiaTV site existed in the tenant (only `Auctorio`, `http://localhost:4420`). A local Site record was created (`POST /v2/sites`, key `guiaprogramaciontv`, type `guiatv`, locale `es-ES`, baseUrl `https://guiaprogramaciontv.com`, timezone `Europe/Madrid`): `siteId = d8e75bac-fa8a-4e27-a17c-6c7eac57b64d`. No publishing credentials attached.

## Verdicts

| # | Step | Verdict |
|---|------|---------|
| 1 | Onboarding | PASS |
| 2 | Intelligence | PARTIAL (thin, biased evidence) |
| 3 | Sources | PARTIAL (works; recommendations irrelevant to a Spanish TV guide) |
| 4 | Competitors | PARTIAL (works; shortlist weak, one low-value opportunity) |
| 5 | Strategy | PASS |
| 6 | Planning | PARTIAL (7x1 ready; 7x2 and 7x3 partial before fill; fill leaves 1/21 unfilled) |
| 7 | Edit and lifecycle | PASS after two fixes (FAIL before: article stored as raw JSON) |
| 8 | Destination draft | BLOCKED (no `GUIATV_AUCTORIO_ADMIN_KEY`; not attempted) |

## 1. Onboarding: PASS

- `POST /v2/sites/:id/onboarding` -> `202 {started:true, operationId:bbe41aa8-..., run.id:8b1dfd81-...}` in 100 ms.
- Second `POST` immediately after -> `200 {started:false}` with the same `operationId` and run id (reused, nothing duplicated). A third `POST` after completion also returned `started:false` with the same run.
- Polled `GET .../onboarding` until `succeeded`. Total 3 min 41 s (14:18:17 to 14:21:58 UTC).

| Step | Status | Duration | Summary / counts |
|------|--------|----------|------------------|
| index | succeeded | 2m31s | 4192 URLs in 6 sitemaps, 199 pages crawled, 0 failed (`pagesIndexed 4192`) |
| profile | succeeded | 0.1s | profile v1: 30 topics, 3 clusters, language `es` |
| sources | succeeded | 20s | 21 candidates (0 first-party, 21 external; 20 verified, 1 failed). Skipped: `web_search_provider_not_configured` |
| competitors | succeeded | 49s | 8 shortlisted: 2 verified, 6 speculative |
| strategy | succeeded | 0.1s | 3 pillars suggested (`heuristic:site-profile-v1`), `approvedVersion 0` |
| first_plan_offer | succeeded | 0.1s | "ready for its first editorial plan" |

## 2. Intelligence: PARTIAL

- Profile: `detectedSiteType tv-programming-guide`, `detectedLanguage es`, audience "spanish-speaking viewers looking for what to watch and where to stream", 4192 pages known, 3 clusters: `movies` (187 pages), `article` (11), `sports` (1).
- URL inventory by section (all 4192 discovered): peliculas 3775, series 282, canales 66, guias 32, programas 14, deportes 6, programacion-tv 4, plataformas 1, plus about 12 legal/info pages.
- Page states: 199 `extracted`, 3992 `discovered` (never fetched), 1 `skipped`. The crawl budget is 199 pages and it took them in sitemap order, so **187 of 199 are `/peliculas/*`**. `/series`, `/canales`, `/programas`, `/programacion-tv` and `/plataformas` pages were discovered but not read, so the profile reflects movie pages and legal pages only.
- Evidence per topic (crawled URLs):
  - movies: 187 pages, e.g. `.../peliculas/2-guns`, `.../peliculas/28-dias-despues`, `.../peliculas/57-segundos`.
  - sports: `https://guiaprogramaciontv.com/deportes/futbol/noticias` (single page; entities detected: `fútbol`, `vuelta`).
  - article cluster = legal/info pages (`/prensa`, `/privacidad`, `/cookies`, `/developers`, `/terminos`, `/avisolegal`, `/accesibilidad`, `/comparador-streaming`, `/sobre-nosotros`, `/politica-editorial`, `/guias`). This is not an editorial topic; it is noise.
  - streaming/plataformas: `mainTopics` lists `tv, programación, streaming, plataformas` but only 3 pages carry it in coverage (`/guias/precios-plataformas-streaming-espana`, `/guias/categoria/streaming`, `/guias/como-ver-la-vuelta-2026-en-tv-y-streaming-canales-y-horarios`).
- Missing / wrong: TV schedule (programacion-tv), channels, series and football pillars are not detected as clusters. `mainTopics` beyond the first 4 are movie-title words (`amenaza`, `ace`, `adios`, `venganza`...). Coverage endpoint reports `article` and `sports` with 144 site pages each, and its sample URLs are movie pages, so topic-to-page matching in coverage is loose (not investigated further).

## 3. Sources: PARTIAL

- `GET .../source-recommendations`: 21 items, all `status open`, 20 `verified`, 1 `failed` (Bloody Disgusting). All are English (`en/US` x18, `en/GB` x3) movie-news feeds or news sitemaps: Collider, ComingSoon, MovieWeb, ScreenRant, Slashfilm, BFI, Deadline (+ sitemap), Empire, Film Comment, IndieWire (+ sitemap), RogerEbert.com, THR (+ sitemap), Variety (+ sitemap), CinemaBlend, Den of Geek, The Playlist. Reason shown: "Curated source pack entry matching site topics: movies, streaming." None is Spanish, none covers TV schedules, channels or football. No first-party source (own sitemap/feed) was proposed.
- Accepted (`POST .../source-recommendations/:id/accept`): Empire -> source `501d18b4-...`, Variety -> source `d6dfe5b2-...`.
- "Test source" (`POST .../sources/:id/test`): Empire `ok, latencyMs 2306, itemCount 20`; Variety `ok, 75 ms, itemCount 10`. Test does not persist items (`GET .../items` was empty afterwards).
- Fetch (`POST /v2/sources/:id/fetch`): Empire `fetched 20, created 20`, Variety `fetched 10, created 10`; items then listed by `GET .../sources/:id/items` (`processingStatus parsed/candidate`).
- `GET .../source-evidence` then returned the items (e.g. Variety "Kaylee Hottle's Sister Will Step in...", Empire "The Thomas Crown Affair Trailer ...", `topics ["movies"]`).
- Minor: titles keep HTML entities (`&#8217;`) in test and evidence output.

## 4. Competitors: PARTIAL

- No search provider is configured (`web_search_provider_not_configured`), so discovery uses only observable evidence. Shortlist of 8: `indiewire.com` (verified, overlap 0.05), `variety.com` (verified, 0.05), and speculative `bloody-disgusting.com`, `deadline.com`, `hollywoodreporter.com`, `tecnoriasl.com`, `themoviedb.org`, `wa.me`. Evidence is either "open source covering movies" (the English feeds above) or "your page links to X" (outbound links). No Spanish TV guide competitor was found; `wa.me` and `tecnoriasl.com` are not competitors.
- Accepted `variety.com` (`PATCH .../competitors/:id {status:"accepted"}` -> accepted); the least implausible of a weak list.
- `POST .../competitors/coverage/refresh` -> `202`, operation `a9359b9c-...` succeeded in 3 s. Coverage: movies site 225 pages vs variety 2 sampled; other topics have 0 competitor pages.
- `GET .../opportunities`: one item, `cannibalization_risk` on movies ("two pages with near-identical titles", `peliculas/ansiedad-tragica` vs `peliculas/65`). No gap opportunities were produced.
- "Add to plan" (`POST .../opportunities/:id/plan {}`) -> `201`, opportunity `status planned`, created proposal `46e8c5c7-...` ("Consolidate overlapping movies pages", `status proposed`, plan `b3a5b10c-...`, scheduled 2026-11-13).

## 5. Strategy: PASS

- `GET .../strategy`: layers `detected`, `suggested` (3 heuristic pillars), `approved: null`.
- `PUT .../strategy` with an approved profile (Spanish TV-information site; audience Spanish viewers; markets ES; language es; formats guide/listicle/news; intents informational, commercial-investigation, news, sports-live; five pillars: Películas dónde verlas 0.30, Series y programas 0.25, Programación TV y canales 0.20, Streaming y plataformas 0.15, Deporte en TV 0.10) -> **version 1**.
- Changed one setting: `PATCH .../strategy/pillars {"name":"Deporte en TV","included":false}` -> **version 2** (note "Pillar "Deporte en TV" excluded"). `GET .../strategy/versions` lists v2 and v1; `effective` provenance shows `approved`.

## 6. Planning (Europe/Madrid, channel website, 2026-11-13 to 2026-11-19, slots 09:00/13:00/18:00 local)

Generator body: `{siteId, dateFrom, dateTo, channels:["website"], articlesPerDay:N, timezone:"Europe/Madrid", language:"es", strategyMode:"balanced"}` (no `excludedTopics` sent; the exclusion came from the approved strategy).

| Run | Plan | Op final | Plan status | Items / expected | Per local date | Dup titles | Time |
|-----|------|----------|-------------|------------------|----------------|------------|------|
| baseline 7x1 (before exclusion) | 58a91196 | succeeded | ready | 7/7 | 1 each | 0 | 51 s |
| 7x1 | dce87e7e | succeeded | ready | 7/7 | 1 each | 0 | 62 s |
| 7x2 | 96fac17d | partial "12 of 14" | partial | 12/14 | 2 on 13-18 Nov, 0 on 19 Nov | 0 | 99 s |
| 7x2 after `/fill` | same | succeeded | ready | 14/14 | 2 each | 0 | 26 s |
| 7x3 | 5535f8bd | partial "14 of 21" | partial | 14/21 | 3,3,3,3,2 then none on 18-19 Nov | 0 | 138 s |
| 7x3 after `/fill` | same | partial "20 of 21" | partial | 20/21 | 3 each, 2 on 19 Nov | 0 | 72 s |

- Provider/model on every plan: deepseek / deepseek-chat.
- Excluded pillar: the baseline (pre-exclusion) plan had 2 of 7 items in "Deporte en TV" (football, La Vuelta). After exclusion, a regex check for fútbol/deporte/partido/liga/vuelta over title, topic and cluster found **none** in the 7x1, 7x2 or 7x3 plans (and none in the fills).
- Brief samples (title | intent | outline sections | evidence entries):
  - 7x1: "Estrenos de cine y series anunciados esta semana: qué llega y dónde verlo en España" | news | 3 | 2; "Prime time en la TDT: cómo leer la parrilla por canal y elegir qué ver" | informational | 3 | 1; "Reparto y sinopsis de una película: cómo consultarlos antes de verla en TV" | informational | 3 | 1.
  - 7x2: "Películas de estreno anunciadas esta semana: dónde verlas en cines y plataformas en España" | where-to-watch | 3 | 2; "Series de misterio y thriller: cómo seguir sus temporadas en TV y plataformas en España" | informational | 3 | 2; "Cine internacional que llega a plataformas en España..." | news | 3 | 2.
  - 7x3: "Películas de catástrofe en TV..." | informational | 4 | 2; "Canales de la TDT en España..." | informational | 3 | 1; "Elegir plataforma de streaming en España según el catálogo..." | commercial-investigation | 3 | 2. One 7x3 item ("Series de misterio con hermanas: The Good Daughter y títulos similares") is built from the accepted Variety item, so accepted source items do reach planning.
- Unfilled reasons (`generatedOutput.unfilledSlots`): every slot says "no valid proposal survived validation after bounded top-up retries". The dropped candidates (13 in 7x2, 15 in 7x3) were rejected mostly by the relevance guardrail ("below relevance threshold (score 18-44 < 45)", a few "near-duplicate topic across generation batches"). Most reasons include `unknown topic cluster "Streaming y plataformas"` (or another approved pillar name): **the guardrail only recognises the detected clusters (movies/article/sports), so a proposal tagged with an approved pillar loses the 15-point cluster bonus** (`src/studio/site-relevance.ts` around line 305, clusters come from `applyApprovedStrategy` in `src/studio/editorial-plan-context.ts`). That explains most partial plans. Not fixed (needs a decision on how approved pillars map to clusters, plus the crawl being too thin).
- Quality notes: titles are heavily "cómo ..." explainers; several clusters in the plan items are labelled with detected names (`movies`, `series`, `article`) instead of approved pillars, so the `article` (legal pages) cluster leaked into one 7x2 proposal.

## 7. Edit and lifecycle: PASS (after fixes)

Item `a817e528-...` (plan 7x1 dce87e7e): `PATCH` title/finalSuggestedTitle, secondaryKeywords (added `acceptance-edit-marker`) and outline (4 sections) -> `200`, 4 outline entries stored; `approve` -> `approved`; `generate-content` -> `202` with project `be79d6ef-...` and job `2e07721a-...` (`GET /v2/production/jobs?planItemId=...`).

Stages: prepare, duplicates, evidence, brief, write, seo, qa, gates, materialize all `done`; final status `needs_review`, stage `review`, ~10 s wall clock. Editor path: `/content/<projectId>`.

First run result (**before fixes**), FAIL:
- Version `title`, `excerpt`, `seoTitle`, `seoDescription` and `bodyHtml` all held the raw writer JSON (`{"title": "Prime time en la TDT...`), wordCount 792 including JSON, QA editorialScore 59.
- Cause: `src/studio/production/stages.ts` capped writer output at `max(1400, 2.2 x targetWordMax)` = 1430 tokens for a 650-word target. DeepSeek's JSON envelope was cut mid-article (stored output 4994 chars, `JSON.parse` fails), and `parseWriterOutput` silently falls back to storing the raw text as the article.
- Cause 2: the project brief's `Titulo:` line used `workingTitle || title`, ignoring the edited `finalSuggestedTitle` (`src/studio/production/plan-item.ts:55`; the project title and Studio use final > working > title).

Fixes (separate commits, each with a test):
- `0d07ffa` `fix(production): give the writer enough tokens...` (`writerMaxTokens`: `min(8000, max(3000, 5 x words))`; `tests/writer-max-tokens.test.ts`).
- `c2f3ffb` `fix(production): plan item brief uses the edited headline...` (`tests/plan-item-brief-title.test.ts`).

After the fixes (API restarted), on fresh items:
- Item `f5a09958-...` -> project `e31c06a6-...`: writer title is a real title ("Cómo comprobar si una película está en el catálogo de una plataforma antes de buscar su emisión en TV"), editorialScore 72, `editorialPassed true`, versionScore 78 (`versionPassed false`), gates `decision review`.
- Item `c7cc2666-...` -> project `bbe10e99-...` (`/content/bbe10e99-1af2-449b-87f6-4a84525a24ad`, job ~8 s, `needs_review`): edited fields verified in the project: `title` = "Acceptance edited headline: deporte, fuera de la parrilla"; brief starts with `Titulo: Acceptance edited headline...` and lists "Acceptance edited H2 one"; `metadata.outline` has the 2 edited sections; `metadata.secondaryKeywords = ["acceptance-kw-one","acceptance-kw-two"]`. SEO title "Temporadas de una serie: cómo ordenarlas y seguirlas", meta description present, 546 words, QA editorialScore 61 / versionScore 81, sources `[{"title":"Guías de streaming, fútbol y TV en España | Guía TV","sourceType":"site","trustScore":80}]`, 1 provenance entry. Status stays `needs_review` because: `policy.autoGenerate/autoApprove/autoSchedule/autoPublish disabled`, "qa score 61 below threshold 75", "configuration requires human approval".
- Re-posting `generate-content` for an item that already has a project returns the existing job (idempotent; no second job).

Still open, not fixed (outside "small and clearly scoped"):
- The body H2s are the fixed English article template (`Lead`, `What you need to know`, `Key facts`, `Context`, `Conclusion`; `src/studio/editorial-engine/structure.ts`), not the planned Spanish outline. The edited outline reaches brief and metadata, but the writer only gets it as a soft hint, so it does not shape the article. English headings in a Spanish article.
- `materialize.imageRequestError: "version_or_topic_not_found"` (plan-item projects have `topicId null`), so no featured image is requested; review gate blockers: "Featured image is still missing".
- `parseWriterOutput` still silently stores raw text if the JSON is ever invalid; a truncation or invalid-JSON case should stop or flag the job instead.
- The legacy worker path `src/infrastructure/workers/worker-text.ts:113` has the same `2.2 x` token cap.

## 8. Destination draft: BLOCKED

`GUIATV_AUCTORIO_ADMIN_KEY` is not available, so publishing activation and the destination draft were not attempted and nothing was faked.

## Cleanup

API process on port 4312 stopped. Local data created in the dev DB (not removed): site `d8e75bac-...`, onboarding run, 21 source recommendations (2 accepted sources, 30 source items), 8 competitor candidates, strategy v1/v2, 4 generated editorial plans (+ the plan holding the opportunity proposal), 4 projects, test user `acceptance.guiatv@auctorio.localhost`.
