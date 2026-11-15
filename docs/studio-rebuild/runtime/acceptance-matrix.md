# STUDIO-01 acceptance matrix and hand-off (2026-11-13)

Branch `feat/editorial-operating-system`. Audited code HEAD `1961e362706bef8ed5ad6264824cec1bdbcab0db` (+ docs-only commits afterwards). Prompt baseline: `origin/main` `173ecf0`. Node v24.18.0, npm 12.0.1. Start: `.claude/launch.json` (API 4302, Studio 4420) + 9 workers via `scripts/start-worker-*.ts`; local DB rebuilt from zero (see db-state-matrix.md).

## Problems from prompt section 4, classified
| Problem | Class | Result |
|---|---|---|
| Unknown runtime commit / dirty tree | CONFIRMED RUNTIME | HEAD above; tree clean (only untracked dev logs, later committed); local is 3 commits / 81 files ahead of main |
| No current screenshots / network traces / DB metadata | CONFIRMED RUNTIME (resolved) | 24 screenshots, request map, sanitized state matrix |
| Skill availability / delegation | NOT VERIFIED | `ui-ux-pro-max`/`unslop` listed as installed, not read (no UI work in this milestone); no sub-agents used |
| Prompt port 4312 vs dev.ps1 4301 vs launch.json 4302 | CONFIRMED CODE | three different API ports in use |
| Archived screenshots (16) vs live UI | CONFIRMED RUNTIME | outdated for the shell/Overview; other 15 not compared |
| Zero-site tenant cannot log in | CONFIRMED CODE+RUNTIME | `completeGlobalAccountLogin` -> `user_not_authorized` when no sites |
| Mock image placeholder PNG corrupt (libpng) | CONFIRMED RUNTIME | defect, not fixed (out of scope) |
| `overview-page.component.ts` CSS budget 7.51 kB > 4 kB | CONFIRMED CODE | build warning |
| `npm test` hangs / 2 flaky unit tests per run | CONFIRMED RUNTIME | not fixed |
| e2e specs stale/assume production data | CONFIRMED RUNTIME | see confirmed-vs-unknown.md |
| Autopilot health spec expects a worker named "automation" | CURRENT RUNTIME HYPOTHESIS | live name is `control` |
| Real-provider article rejected by QA (score 71<75, unsupported claims) | CONFIRMED RUNTIME | gate working; content quality is another milestone |

## Dimension verdicts (PASS / PARTIAL / BLOCKED / FAIL)
| Dimension | Verdict | Evidence / why |
|---|---|---|
| IMPLEMENTATION | PASS | no code changed by this milestone; typecheck + build pass |
| FUNCTIONALITY | PARTIAL | 8 routes load, all API 200; e2e 16/26 on clean DB; CTAs not exercised |
| UX/UI | PARTIAL | 24 screenshots, no overflow, 0 console errors; visual review only Overview |
| ACCESSIBILITY | BLOCKED | no keyboard/ARIA/contrast pass done |
| SECURITY | PARTIAL | publish/credential/automation endpoints have permission guards; bulk-approve and social-connection guards unchecked; no secrets in evidence |
| INTEGRATION | PARTIAL | BFF endpoints mapped; 0 publishing accounts / social connections locally |
| REGRESSION | PARTIAL | unit 465/467 (flaky), e2e failures not triaged to regressions |
| PRODUCTION READINESS | BLOCKED | no destination credentials, no prod validation, keys not deployed |

Independent review (prompt section 13): intentionally not done, per project owner instruction.

## Hand-off
- STUDIO-02: sites/connectors baseline; first-site/zero-site login gap; 2 provisioned sites (+ e2e leftovers).
- STUDIO-03: modes: all provisioned sites `manual`, autoApprove/autoPublish false; mode UI present on Overview/Automation.
- STUDIO-04: covered by `docs/acceptance/studio-04-site-intelligence-2026-11-13.md` (stratified sampling, utility-page exclusion, Coverage tab). Hand-off for 05/06 in `studio-04-handoff.md`.
- STUDIO-05: covered by `docs/acceptance/studio-05-sources-competitors-provenance-2026-11-15.md` (language/country source ranking, `tv-streaming-es` pack, competitor false-positive filter, source→plan→draft provenance, Sources tabs + Evidence).
- Defects to schedule (not fixed here): corrupt mock PNG, zero-site login, flaky unit tests / `npm test` hang, stale e2e specs, overview CSS budget.


---

# STUDIO-02 acceptance (2026-11-13) — destination identity and readiness
Details: `STUDIO-02-destination-readiness.md`. Evidence: `docs/studio-rebuild/evidence/studio-02/`.

| Acceptance criterion | Verdict | Evidence |
|---|---|---|
| Synthetic GuíaTV installation without PublishingAccount appears exactly once, Not verified | PASS | HTTP test + real `/v2/overview` + screenshots |
| Missing/incorrect credentials never render Connected/Ready; write capability separate | PASS | `readiness` ready/not_verified/stale/error; `checks.*` tri-state; real e2e verification persisted `auth:passed`, `draft_roundtrip:passed`, `canPublish` stays unknown |
| Existing website/social accounts still appear; tenants isolated | PASS | HTTP tests (legacy-only, dedupe, second tenant sees none) |
| No real publication or credential exposure | PASS | no publish; ciphertext never serialized (asserted) |

Cases covered: Site only, active installation only, legacy account only, both, disabled, cancelled, failed, stale (>30 d), wrong tenant. Not applicable: "no scopes" (social OAuth scopes are STUDIO-03/09 territory; the social path was not changed).

Commands run: `npm run typecheck` PASS; `npm run build:studio` PASS; compiled backend suite 474/474 (before the stale/legacy additions; destination-readiness file now 9/9); Angular `ng test` 30/30; e2e `connection-installer.spec.ts` 5/5 (`npm run dev` now starts the API and all 9 workers, including the connection worker); axe wcag2a/aa 0 violations on Overview and Connections (1440); screenshots 1440/1024/390.

Dimension verdicts: IMPLEMENTATION PASS · FUNCTIONALITY PASS · UX/UI PASS · ACCESSIBILITY PASS (automated + keyboard focus; no screen-reader pass) · SECURITY PASS · INTEGRATION PASS (no live destination used; `canPublish` stays unknown by design, no publish probe) · REGRESSION PASS · PRODUCTION READINESS BLOCKED (no deploy/live credentials by rule).
Independent review: intentionally not done, per project owner instruction. No PR opened (not authorized). No migration needed (additive JSON under `capabilities.verification`; rollback = revert the commit).

Hand-off: STUDIO-03/08/09 can read `connections[].readiness` / `checks` from `/v2/overview` and `loadWebsiteDestinations(tenantId)`.

## STUDIO-04 (2026-11-13) — Site Intelligence evidence
Full record: `docs/acceptance/studio-04-site-intelligence-2026-11-13.md`. Screenshots: `screens/studio-04-coverage-{1440,1024,390}.jpg`.
Dimension verdicts: IMPLEMENTATION PARTIAL · FUNCTIONALITY PASS · UX/UI PARTIAL · ACCESSIBILITY PARTIAL (not audited) · SECURITY PASS · INTEGRATION PARTIAL · REGRESSION PARTIAL · PRODUCTION READINESS BLOCKED.
Not done: SEO-signals/Opportunities tabs, Playwright E2E, full `npm test`, independent review (owner instruction), dedicated worktree.

## STUDIO-05 (2026-11-15) — Sources, competitors and provenance
Full record: `docs/acceptance/studio-05-sources-competitors-provenance-2026-11-15.md`. Screenshots: `screens/studio-05-sources-*.png`.
Dimension verdicts: IMPLEMENTATION PARTIAL · FUNCTIONALITY PASS · UX/UI PARTIAL · ACCESSIBILITY PARTIAL (not audited) · SECURITY PASS · INTEGRATION PARTIAL · REGRESSION PARTIAL · PRODUCTION READINESS BLOCKED.
Not done: full `npm test`, independent review (owner instruction), site-type classification, ids on manually added plan evidence.
