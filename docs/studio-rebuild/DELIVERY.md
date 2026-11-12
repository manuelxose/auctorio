# Delivery: Studio dual navigation, copilot and competencies

- Branch: `fix/deploy-ref-and-health` @ `38146de` plus uncommitted work (not committed, not pushed, no PR, not deployed).
- Pre-existing local changes left untouched: `README.md`, `package.json`, `compose.local.yml`, `scripts/dev.ps1`, `.dev-restart.*`.

## Status by dimension

| Dimension | Status |
|---|---|
| Dual navigation | PASS (desktop, tablet, mobile, collapsed, persisted, keyboard) |
| Copilot | PARTIAL: persistence, context, competencies, failure/retry/cancel verified; real LLM not verified (no key locally); no streaming |
| REA integration | PARTIAL: matrix done; REA turned out to be a reverse-engineering toolkit workspace with few product competencies; 4 patterns adopted |
| Visual (ui-ux-pro-max + unslop) | PARTIAL: shell and Studio surfaces done; per-page pass pending |
| Preserved functionality | PASS for the routes exercised; 2 backend tests failing, not attributable |

## Known limitations / follow-ups

1. Configure `TEXT_PROVIDER`/`TEXT_API_*` in a test environment and repeat the copilot checks with a real model.
2. Mutating competencies (regenerate, hero image, publish, repair) need an approval flow.
3. Run the Playwright e2e suite and add specs for the shell and copilot.
4. Initial bundle 516.5 kB vs 500 kB budget (after pass 2).
5. ~~`ng serve` cannot hard-load `/studio/*`~~: fixed in pass 2.
6. Investigate the 2 failing backend tests on a clean baseline.

## Pass 2 (glass, processes, magic connect, dev server)

| Item | Status |
|---|---|
| `ng serve` hard-loads `/studio/*` | FIXED. The server sent a CSR shell that doesn't exist in dev, and the auth guards ran during the server render with no browser session. The engine now renders when the shell file is missing, guards defer to the browser on the server (the SSR middleware has already validated the cookie), and the shell bootstraps its session only in the browser |
| Glassmorphism | RESTORED and refined (see DESIGN-SYSTEM.md) |
| Magic connect | NEW: one field on Connections and as wizard step 1; website → discovery runs automatically; Instagram/X link → authorize step with the handle; bare @handle → choose the network; `?target=` deep link; reuses an open draft instead of duplicating |
| Wizard bugs fixed | The social flow showed the website panel (step/panel numbering mismatch) and had no way to continue after authorizing; missing `arrow-right`/`loader` icons; developer jargon in copy |
| Article pipeline | NEW stepper on the article page, driven by the review gate |
| Tables, search fields, detail grids | Restyled globally |
| Tests | Studio unit tests 20/20 (new: connect-target 6, article-pipeline 5); production build passes |
| Still blocked | Social authorization needs a provider (Ayrshare or X/Meta apps) configured server-side; real LLM key for the copilot |

## Pass 3 (blockers, Overview modelled on BabyLoveGrowth)

| Item | Status |
|---|---|
| Copilot and generation with a real model | DONE: every model call goes through an API provider chosen per workspace in Settings → AI (admins only): DeepSeek, Claude (Anthropic SDK) or OpenAI/Codex. Keys stay in the server env (`DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`); no self-hosted model is used. Verified with DeepSeek (test answer in 0.9 s) |
| Instagram / X provider | NOT POSSIBLE without your credentials. The wizard now shows a setup guide instead of "ask an operator": both options (Ayrshare key, or own X/Meta app), the exact variables and the OAuth callback URL with a copy button, plus the server's live status |
| Initial bundle | 491 kB, under the 500 kB budget. Cause: the HTTP interceptor and route guards imported the 53 kB Studio API client into every page; now an `ActiveSiteStore` signal and on-demand guard imports keep it in the lazy Studio chunk. 3.6 kB of dead CSS removed |
| Remaining screens | Swept: uppercase tracked labels removed (channels, menus, calendar, story drawer, editorial brief), emoji link icon replaced. They already inherit glass, tables, stepper |
| Overview | Rebuilt after BabyLoveGrowth's dashboard (studied from the REA authenticated captures in `rea/docs/research/BLG-01-AUTHENTICATED-UI-INVENTORY.md`, the screenshots in `rea/docs/evidence/blg01/` and their public docs). Patterns adapted, no copy or branding taken |

### What was adapted from BabyLoveGrowth

| Their pattern | Auctorio version (real data only) |
|---|---|
| Status line "on autopilot / no action needed" | Headline computed from setup steps and the automation policy (left steps, paused + reason, off, running) |
| "What your agents did today" with a day stepper, featured article (keyword, volume, difficulty, why this topic), planned actions | Activity card with ‹ day ›: operations of that day in plain words (failures flagged), the day's planned topic with keyword, difficulty band, intent, time and the planner's rationale in "Why this topic"; future days show the plan |
| Get started: required (connect website) + optional (GSC, GA, Instagram) | Required: connect website, learn about the site, plan 30 days, choose approval level (inline: write when I ask / write, I approve / autopilot). Optional: Instagram, X, news sources. Each row acts in place (Analyze, Plan, mode picker) or deep-links to the magic connect |
| Content calendar with Published / Generated / Queued and KD + volume | "Coming up": 7 days of planned topics with Published / Written / Queued / Needs approval chips and keyword; picking one opens that day |
| "Here's what we learned about your brand" + Looks good / Not quite right | Site intelligence summary, audience, language, tone, site type, pages read, main topics; "Not quite right, review it" and "Read the site again" |
| Automatic daily generation + approval setting | Existing automation policy (articles per day, auto generate/approve/publish) chosen through the three modes; the 30-day plan feeds it |
| Not taken | Money-back badge, promotions, social-proof "success story", backlinks marketplace, invented metrics |

### Planning speed (pass 3b)

- Cause: the planner wrote 2 topics per model call, one call after another, so a 30-day plan was 15 sequential calls with nothing saved until the end.
- Fix (`src/studio/editorial-plan.ts`): calls run in parallel waves (`EDITORIAL_PLAN_CONCURRENCY`, default 4); each wave receives the titles already planned, duplicates are still dropped at merge and the existing top-up fills gaps. 15 sequential calls become 4 rounds. After every wave the operation records "N of 30 topics planned", which the Overview shows on the Plan button and refreshes every 5 s while planning.
- Model provider: no self-hosted model (Ollama config removed). Providers are DeepSeek, Claude and OpenAI/Codex over their APIs, selectable in Settings → AI; the choice is stored per workspace (`ai_provider_settings`) and applies to requests and workers. On this machine only `DEEPSEEK_API_KEY` is present; Claude and OpenAI show "No key" until `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` are set on the server.
- Plan speed with DeepSeek: 90 topics in 157 s (4 topics per call, parallel calls; first topics after ~20 s). It previously failed after 171 s because the relevance filter rejected every topic when the site profile had no topics yet (crawl read 0 of 24 pages); that case is now kept and covered by a test. Tunables: `EDITORIAL_PLAN_ITEMS_PER_CALL` (4), `EDITORIAL_PLAN_CONCURRENCY` (8).
