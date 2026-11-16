# STUDIO-02 — Destination identity and readiness (HEAD after a21b641 + follow-up)

## Root causes
- CONFIRMED CODE: `/v2/overview` reported every active website `ConnectorInstallation` as `connected` (status alone). Fixed: `readiness` = ready only with `verifiedAt` and no `lastError`.
- CONFIRMED CODE: a legacy website `PublishingAccount` and its installation could both list for one site. Fixed: installation supersedes the legacy account of the same site (Overview and Connections).
- CONFIRMED CODE: Connections showed an active installation as "Active" without verification and no site name. Fixed: "Not verified" / error state, site name from session sites, "Verify" repair action.
- CONFIRMED CODE: Overview did not reload on active-site change. Fixed with an effect on `siteId`.
- HISTORICAL TEST (12-Nov GuíaTV, no credentials): not re-observed at runtime here.

## Contract (additive, `/v2/overview` → `connections[]`)
`readiness` (`ready|not_verified|error`), `reason`, `checks{configured, authenticated, reachable, capabilitiesVerified, canCreateDraft, canPublish}` (tri-state, `null` = unknown), `lastVerifiedAt`, `lastSuccessfulPublicationAt`. Legacy `connectionState` kept (`connected|not_verified|provider_error`). Ciphertext is selected only to compute `configured`, never serialized.
Source: `src/studio/destination-readiness.ts` (`loadWebsiteDestinations`, tenant-scoped on every query). Unlinked installations are matched to a Site by normalized origin read-only (ambiguous = unlinked); no Site is cloned or retyped.
Worker (`worker-connection.ts`) now persists probe outcomes under `capabilities.verification` (no secrets). No migration needed.

## Verification
- `npm run typecheck` PASS; `npm run build:studio` PASS.
- `tests/destination-readiness.test.ts` (6) incl. synthetic GuíaTV installation without PublishingAccount → exactly once, `not_verified`, two-tenant isolation, no ciphertext in output: PASS (local DB). `connector-routes`, `connector-registry`, `site-isolation`: 15/15 PASS.
- Not covered by tests: wrong-tenant at HTTP level, revoked/stale installation states beyond `active`, read-only probe for `canPublish` (no probe exists; stays unknown).

## Completion pass (runtime, `npm run dev` Studio :4420 / API :4301, Playwright Chromium)
- Connections now resolves the site of an unlinked installation by normalized origin (read-only, `GET /v2/connector-installations`); row shows `GuiaProgramacionTV`, "Not verified", Verify action at 1440/1024/390.
- Site switch: Overview "Publishing to" shows the GuiaTV destination (Not verified, Verify) and, after switching to Tecnoria, "No destinations yet" (no stale or tenant-wide row).
- Accessibility (axe-core wcag2a/aa, Overview and Connections at 1440): found `button-name` (icon-only Remove button) and `definition-list` (`<span>` inside `<dl>` KPI groups); both fixed; re-run: 0 violations. Verify action reachable by keyboard focus.
- Tests: new HTTP contract test (legacy account + active + disabled + cancelled + failed installs collapse to one row; second tenant sees none; list links site by origin; no ciphertext). Full compiled backend suite: 474/474 pass. Screenshots: `evidence/studio-02/` (overview/connections 1440, 1024, 390; overview-switched-1440).
- Synthetic installation removed after the run. Local QA password hash was reset to the `.env` value.

## Dimension verdicts
IMPLEMENTATION PASS · FUNCTIONALITY PASS · UX/UI PASS (1440/1024/390) · ACCESSIBILITY PASS (axe wcag2a/aa on the two pages, 1440; no screen-reader pass) · SECURITY PASS · INTEGRATION PARTIAL (`canPublish`/last publication stay unknown until a publish probe exists; no live destination used) · REGRESSION PASS (474/474 backend; Angular specs and e2e suite not run) · PRODUCTION READINESS BLOCKED (no deploy or live credentials, by rule).
Independent review: skipped by standing instruction.

## Final completion pass
- `stage` added to each destination (`unconfigured|stored|not_verified|authenticated|read_only|ready|stale|error`); Overview labels use it (screenshot `overview-stage-1440.png`: "Stored · Verify" for a synthetic install with a credentials reference and no verification). Stale = verification older than 30 days.
- `/v2/overview?siteId=` scopes publication, content, source and plan counts and automation status to the active site (unknown or foreign site id falls back to the tenant, never leaks). Overview sends the active site id and reloads on site change. Known residual: `inboxCandidates` (SourceItem has no `siteId` column) stays workspace-wide.
- Tests: `destination-readiness.test.ts` 11/11 (stage matrix, site scoping). Full backend suite 476/478: the 2 failures (`duplicate enqueuePublication calls are idempotent…`, `concurrent strategy saves both succeed…`) are the pre-existing flaky tests listed in STUDIO-01 (they also fail when run alone and hang the process), unrelated to destinations. Angular `ng test` 30/30; e2e `connection-installer` 5/5 earlier with `npm run dev` (API + 9 workers).
- Feature ownership: destination readiness read model = `src/studio/destination-readiness.ts` (consumers: `/v2/overview`, Overview and Connections pages; next consumers STUDIO-03/08/09).
