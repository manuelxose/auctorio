# Confirmed vs unknown — STUDIO-01 (clean-DB rerun, 2026-11-13)

## Environment rule (project memory)
Local must be a clean clone of production: empty DB, same migrations, API + workers + Redis. Reset done as described in db-state-matrix.md. Remaining gap vs prod: AI provider is `mock` (no real keys available).

## e2e on the clean DB (`E2E_ALLOW_REAL_PUBLISH` unset, nothing published)
Run history: dirty DB 8 passed/12 failed; clean DB with no sites 0 passed (login impossible, see below); clean DB + 2 provisioned sites + workers: **16 passed, 7 failed, 3 skipped (2.5 min)**.

| Remaining failure | Cause |
|---|---|
| guiatv-seo 2.1 "plan error: EDITORIAL_PLAN_STRUCTURED_OUTPUT_INVALID" (+ 2.2/2.3 skipped, 3 and 4 fail as consequence) | mock AI provider cannot produce structured plan output; needs real provider |
| production-journey journey / provider failure (2) | spec expects a real provider failing with 502/400; mock returns 200/202 |
| autopilot source->project, irreparable (skipped) | depends on AI output from a real provider |
| autopilot health | spec expects a worker whose name contains "automation"; the live health lists `connection`, `control`, `discovery`, `image`, … — the automation worker registers as `control`. Likely a **stale spec** or a naming bug (unverified) |

Fixed by the clean setup (were failing before): login, site switching, connector installer, notifications, content workflow.

## Unit tests (`node --test --test-force-exit dist/tests/*.test.js`, separate DB `content_ai_test`)
465/467 in each of two full runs, but the 2 failures were **different tests each run** (run 1: automation-recovery, site-strategy; run 2: site-onboarding ONB-01, phase5 duplicate enqueuePublication) and all pass in isolation => parallel-file flakiness on a shared DB, not deterministic. `npm test` itself hangs (open handle after `autopilot-planner.test.ts`); not fixed.

## CONFIRMED
Typecheck/build pass; 24 screenshots re-captured on the clean DB: all 8 routes load at 1440/1024/390, no horizontal overflow, zero console errors, zero HTTP >=400. Permission guards on publish/credential/automation endpoints exist (network-request-map.md).

## UNKNOWN / not done
- Behaviour with a real AI provider and real destination (0 publishing accounts, 0 social connections) => PRODUCTION READINESS BLOCKED.
- Full CTA handler -> DB transition trace; guards of bulk-approve and social-connection endpoints; QA role set.
- Visual/a11y review of the 24 images beyond Overview.

## Hand-off
STUDIO-02: first-site provisioning gap (zero-site login) and 2 sites above. STUDIO-03: all sites start in `manual`. STUDIO-04: not covered.
