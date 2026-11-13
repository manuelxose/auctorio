# STUDIO-01 — Runtime baseline (2026-11-13)

Read-only audit. No migrations, publications, token changes or DB writes were made.

## Environment (CONFIRMED RUNTIME)
- Branch `feat/editorial-operating-system`, HEAD `1961e362706bef8ed5ad6264824cec1bdbcab0db`.
- Audit prompt baseline was `origin/main` `173ecf0`; local HEAD is **3 commits / 81 files ahead** of it (+2424/-2164). Local runtime != GitHub main.
- Untracked only: `.dev-restart.err`, `.dev-restart.log`, `.playwright-mcp/` (no tracked changes).
- Node v24.18.0, npm 12.0.1. Last migration: `20261112180000_ai_provider_keys`.
- Docker: `auctorio-postgres-1` (55432) and `auctorio-redis-1` (56379) healthy. API and Studio were NOT running at start.
- Started via `.claude/launch.json` (not `scripts/dev.ps1`, to avoid `prisma migrate deploy`): API on **4302**, Studio ng serve on **4421** (4420 was taken). Prompt's API port 4312 and dev.ps1's 4301 do not match what ran.

## Checks
| Check | Result |
|---|---|
| `npm run typecheck` | PASS (no output, tsc clean) |
| `npm run build:studio` | PASS; 1 budget warning: `overview-page.component.ts` CSS 7.51 kB vs 4.00 kB |
| `npm test` | NOT RUN (runs migrate deploy; needs isolated DB) |
| `npm run test:e2e` | NOT RUN (config defaults to https://auctorio.com) |
| Screenshots 1440/1024/390 | PARTIAL: only 1440 Overview viewed in the built-in browser; no files saved (tool does not write to disk). Other viewports/routes BLOCKED |
| Playwright MCP screenshots (8 routes x 3 viewports) | BLOCKED: its browser landed on `chrome-error://chromewebdata/` for localhost:4421 (cannot reach the dev server); 24 error-page captures were discarded, not kept as evidence |
| Skills ui-ux-pro-max / unslop | Listed as installed; not read (no UI change in this milestone) |

## Responsive load check (QA account, no image files)
8 routes (overview, site-intelligence, sources, editorial-plan, content, calendar, automation, connections) x 1440 (real viewport), 1024 and 390 (same-origin iframes of that width). Every route: no redirect, correct h1, **no horizontal overflow**. Content route renders little text (873 chars at 1024), likely an empty state — not inspected visually. This is a DOM check only: no visual/a11y verdict, no screenshots saved.

## Overview request map (`/studio/overview`, all 200)
`session/me`, `v2/admin/me`, `v2/operations` (x2), `v2/overview`, `v2/automation?siteId=`, `v2/site-intelligence/{site}`, `v2/editorial-plans?siteId=` + 3x `editorial-plans/{id}`, `v2/events/stream` (SSE), `v2/notifications`. Studio proxies through `/studio/api/backend/...`.

## Sanitized state (via authenticated BFF path)
> Session identity: the built-in browser was signed in as the local QA account `qa.visual@auctorio.localhost`, NOT `manuelxgon@gmail.com`. Everything below reflects that account's tenant view; re-run as the owner account before trusting it.

- Sites: `GuiaProgramacionTV` (d8e75bac…), `Auctorio` (f76991c2…).
- Automation for GuiaProgramacionTV: `enabled=true`, `mode=assisted`.
- Connector installations: 17, all `kind=website`; only **1** is linked to a site (1a08304b… → GuiaProgramacionTV), 16 have `siteId=null` (orphaned/unfinished wizard runs — HYPOTHESIS, not verified in DB).
- No secrets, cookies or credential refs were read.

## Routes (CONFIRMED CODE, `app.routes.ts`)
Studio: overview, content(/new,/:id), calendar, editorial-plan, competencies, site-intelligence, publications, inbox, editorial-engine, sources, competitors, automation, media, connections(/wizard/:id), activity, operations, notifications, profile, settings(/:section), admin(/:section); legacy redirects: dashboard, projects, editorial, ai, assets, review, publishing, integrations, analytics.

## Confirmed vs unknown
- CONFIRMED: services run, typecheck/build pass, overview loads with data for GuiaProgramacionTV, mode is `assisted`.
- UNKNOWN: publishing-account/policy state per site, role permissions, 1024/390 layouts, whether the 16 unlinked installations are expected, whether archived screenshots in `evidence/` (16) match current UI.

## Dimension verdicts
IMPLEMENTATION PASS · FUNCTIONALITY PARTIAL · UX/UI PARTIAL · ACCESSIBILITY BLOCKED · SECURITY PARTIAL · INTEGRATION PARTIAL · REGRESSION PARTIAL · PRODUCTION READINESS BLOCKED. No independent review done.
