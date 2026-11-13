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

## Dimension verdicts
IMPLEMENTATION PASS · FUNCTIONALITY PARTIAL · UX/UI PARTIAL (1440 and 390 captured in evidence/studio-02; 1024 not captured) · ACCESSIBILITY not audited · SECURITY PASS (tenant-scoped, no secrets) · INTEGRATION PARTIAL · REGRESSION PARTIAL (targeted suites only; full `npm test` not run) · PRODUCTION READINESS BLOCKED (no deploy/live credentials).
## Runtime evidence (`npm run dev`, Studio :4420, API :4301)
Synthetic active website installation (no PublishingAccount, unlinked, `config.baseUrl` = GuíaTV origin) in the QA tenant: real `/v2/overview` returned exactly one row, `siteId` linked by origin, `readiness: not_verified`, all checks null/false. Overview shows "not verified" with a Verify link; Connections shows "Not verified" with a Verify action. Screenshots: `docs/studio-rebuild/evidence/studio-02/`. Synthetic row deleted afterwards.
Known gap: Connections still shows "Workspace default" as site for an installation whose `siteId` is null in the DB (origin linking is only applied in `/v2/overview`).
Local QA password hash was reset to the `.env` value (disposable local DB).
Independent review: skipped by standing instruction.
