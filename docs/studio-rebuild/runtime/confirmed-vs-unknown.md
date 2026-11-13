# Confirmed vs unknown — STUDIO-01 (2026-11-13)

## e2e (`npm run test:e2e`, Chrome from `CHROME_BIN`, base http://localhost:4420, QA account, `E2E_ALLOW_REAL_PUBLISH` NOT set)
Result: **8 passed, 12 failed, 1 skipped, 5 did not run (5.4 min)**. Nothing was published.
Specs are written for the production tenant (sites `guiatv-editorial`/`tecnoria-main`, >=2 sites, real providers), so most failures are CURRENT RUNTIME HYPOTHESIS "environment/data mismatch", not proven regressions. Not investigated one by one:

| Failure | Likely cause (unverified) |
|---|---|
| studio-workflow login/site-switching/content (3) | QA tenant has 2 sites but not the expected keys; 401 on site switch; spec stale vs new shell |
| guiatv-seo 1 (+5 did not run) | site `guiatv-editorial` does not exist in local DB |
| autopilot health | needs a worker named `*automation*`; only the API process was started (no worker) |
| autopilot source->project | depends on worker/provider; no worker running |
| connection-installer 1 | expects connector `auctorio_feed`; metadata returned only generic_rest, generic_webhook, x_oauth, instagram_oauth although code references `auctorio_feed` (src/studio/connectors/registry.ts) — **worth checking, possible real gap** |
| connection-installer 2, 3 | 2.0 min timeouts in wizard flow |
| production-journey (2) | expected status 502/400, got 200/202 (mock provider) |
| notifications-links 2 | plan table has 0 rows for the active site |

## CONFIRMED CODE / RUNTIME
Typecheck + build pass; unit tests 465/467 (2 flaky); 24 screenshots, all routes 200, no console errors; all permission guards on publish/credential/automation endpoints present (see network-request-map.md).

## UNKNOWN
- Whether any of the 12 e2e failures is a product regression (needs worker running + seeded GuiaTV site).
- Role set of the QA account; guards of bulk-approve and social-connection endpoints.
- 16 unlinked connector installations: intended or leftovers.
- Real publishing readiness: 0 publishing accounts and 0 social connections locally, so PRODUCTION READINESS stays BLOCKED.
- Full CTA handler -> DB transition trace: not done (static endpoint map only).

## Hand-off
- STUDIO-02: sites + connectors metadata above; local DB has no publishing account.
- STUDIO-03: modes: GuiaProgramacionTV `assisted`, Auctorio `manual`; autoApprove/autoPublish both false.
- STUDIO-04: not covered.
