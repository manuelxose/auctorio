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

## e2e with real AI (DeepSeek deepseek-chat, test key from .env; provider selected via PUT /v2/ai/provider; connection test ok, 1.1 s)
Result: **16 passed, 7 failed, 3 skipped (3.7 min)**, nothing published (no destination credentials, `E2E_ALLOW_REAL_PUBLISH` unset).
- Changed vs mock run: guiatv-seo 2.1 (7x1 plan, real structured output) now PASSES.
- guiatv-seo 3 (article): generation ran but `qaState` = `failed` (expected `passed`) => real content-QA gate rejects the DeepSeek article; cause not investigated (needs the QA report). Step 4 fails as consequence.
- 2.2/2.3 skipped (opt-in `E2E_PLAN_ALL_CADENCES`); autopilot irreparable skipped.
- autopilot source->project: still no automatic project; not investigated. autopilot health: stale worker-name assertion (as before).
- production-journey (2): expect 502/400 from a *failing* provider but get 200/202/404/422 => assertions depend on a provider-failure setup, not on a healthy provider.
- notifications "saved plans table": 0 rows for the active site.

## Root-cause follow-up on the article QA failure (CONFIRMED)
- Earlier `qaState=failed` came from the only severity-error check `image_ready` (no hero image). Image generation under `IMAGE_PROVIDER=mock` failed with `vipspng: libpng read error` because `PLACEHOLDER_PNG_BASE64` in `src/infrastructure/ai/image.ts` is a corrupt PNG (reproduced with sharp). Other failed checks were warnings only (word_count 675 < 1200, internal_links 0, intent_defined).
- Fixed: replaced the placeholder with a valid 16x9 PNG; added `tests/mock-image-provider.test.ts` (decode + resize), passes. End-to-end effect NOT yet confirmed: in the rerun the pipeline was rejected earlier by the content gates, so no image job ran.
- Rerun of guiatv-seo spec: steps 1 and 2.1 pass; step 3 now times out after 4 min because `content_production` failed `quality_rejected`: "qa score 71 below threshold 75; critical unsupported factual claims present; configuration requires human approval". This is the real QA gate rejecting the DeepSeek draft (content quality/prompt/sources), not a plumbing bug; gates were not loosened. Step 4 depends on it.
- A third site (`fa15d8a4…`) was created by the e2e run in the local DB.

## Keys / platform admin
AI keys live in the gitignored .env (see memory reference-ai-test-keys); local QA user added to PLATFORM_ADMIN_EMAILS in .env to reach admin AI endpoints. Image provider left on mock. Production deployment of keys NOT done (no access, needs explicit go-ahead).

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
