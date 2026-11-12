# Test evidence (2026-11-11, local Windows host)

Environment: Postgres/Redis via `compose.local.yml`; API (this branch) on 127.0.0.1:4302; Studio production SSR build on :4425 (`.claude/launch.json` → `studio-ssr`); local QA admin account created with `scripts/qa-visual-login.ts` (credentials only in the git-ignored `.env`).

## Automated

| Check | Command | Result |
|---|---|---|
| Prisma schema | `npx prisma validate` | valid |
| Migration ↔ schema drift | `prisma migrate diff --from-migrations … --to-schema-datamodel …` | empty migration (no drift) |
| Migration applied | `npx prisma migrate deploy` | applied |
| Backend typecheck | `npx tsc -p tsconfig.json --noEmit` | pass |
| New backend tests | `node --require ts-node/register --test tests/copilot-competencies.test.ts` | 5/5 |
| Full backend suite | `npm run build && node --test "dist/tests/**/*.test.js"` | 392/394. Failing: `buildImageDerivatives…` (native `sharp`) and `concurrent scheduler claims…` (shared local DB while another API on :4301 runs). Neither touches changed code; not re-run on the baseline |
| Studio unit tests | `ng test --watch=false --browsers=ChromeHeadless` | 9/9 (3 new Markdown sanitizer specs) |
| Studio production build | `ng build --configuration production` | pass; warning: initial bundle 507.5 kB > 500 kB budget |

## Browser (real API, production SSR build)

| Scenario | Result |
|---|---|
| Top bar + full grouped sidebar at 1440 | pass (`evidence/02-dual-nav-1440.jpg`) |
| Collapse → 64 px rail, state persists across reload | pass (`09-collapsed-rail.jpg`) |
| Active entry + breadcrumb on `/studio/content/:id` | Content active, "Editorial › Article" |
| Command palette: open, filter "compet", Enter → `/studio/competencies` | pass |
| Copilot open from sidebar, docked column, content reflows | pass |
| Workspace brief via suggestion → persisted thread, competency, sources | pass |
| Article context: chip, article suggestions, SEO review deterministic findings | pass (`04-seo-review-findings.png`) |
| OpenAI-compatible provider path (local fake endpoint, 3 s delay): evidence delivered, Markdown + internal link, tokens 214 recorded | pass (`03-copilot-article-http-provider.jpg`) |
| Failure (provider unconfigured) → error + Retry → regenerated in place | pass |
| Stop during generation → UI "Stopped"; DB `assistant:cancelled` | pass (needed the proxy abort fix) |
| History list, search `q=SEO`, thread reload | pass |
| Audit log rows `copilot.competency.run` | 3 rows |
| Competencies page: registry, allowed, runs, history incl. cancelled | pass (`05-competencies-page.jpg`) |
| Tablet 1024: collapsed rail, copilot overlay 440 px + backdrop, no overflow | pass (`06-…`) |
| Mobile 390: no horizontal overflow (clientWidth = scrollWidth = 390), drawer focus in, copilot full screen 390×844, Esc closes | pass (`07-…`) after header fix |
| Dark theme | pass (`08-dark-1440.jpg`) |

## Security probes (through the signed proxy)

Foreign projectId → 404 · foreign siteId → 404 · malformed siteId → 400 · foreign threadId → 404 · foreign retry → 404 · foreign thread GET → 404 · empty → 400 · 4001 chars → 400 · project competency without article → 400 · unknown competency → 400 · direct API unsigned → 401 · forged signature headers → 401.

## Accessibility (scripted; axe-core not installed, not added)

No unnamed controls, no duplicate ids, no images without alt in the shell; landmarks: banner, 2 nav, main, skip link. Contrast vs sidebar surface: light 6.59 (items), 4.9 (group labels, keycaps); dark 7.08 / 5.18; active 15.2. Keyboard: Tab order, Arrow/Home/End in sidebar, Ctrl/⌘K, Ctrl/⌘J, Esc; focus returns to launcher (desktop) or menu button (phone).

## Not run

Playwright e2e suite (`npm run test:e2e`), visual regression baselines, Lighthouse, real LLM provider, live GuíaTV/Tecnoria publishing (no authorization for external publication).
