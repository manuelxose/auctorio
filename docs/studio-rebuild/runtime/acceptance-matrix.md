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
- STUDIO-04: not covered (crawl sampling); site_index operation succeeded for guiatv-editorial in e2e step 1 (43 s).
- Defects to schedule (not fixed here): corrupt mock PNG, zero-site login, flaky unit tests / `npm test` hang, stale e2e specs, overview CSS budget.
