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
IMPLEMENTATION PASS · FUNCTIONALITY PARTIAL · UX/UI BLOCKED (no screenshots) · ACCESSIBILITY BLOCKED · SECURITY PASS (tenant-scoped, no secrets) · INTEGRATION PARTIAL · REGRESSION PARTIAL (targeted suites only; full `npm test` not run) · PRODUCTION READINESS BLOCKED.
BLOCKED reason: the only API on :4302 is another chat's process running pre-change code, and no QA login credentials are available to this session.
Independent review: skipped by standing instruction.
