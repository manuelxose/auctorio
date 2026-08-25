# Magic Installer + Job Center + Notifications — Implementation Map

Graph reviewed at head `43c1c2e8ec0b4394ea59708a8d6be406f367a4d0` (graph.json 3299 nodes, recently updated).

## 1. Verified current-state anchors (with corrections)

| Master-prompt anchor | Actual location | Notes |
|---|---|---|
| Connection UI | `apps/studio-web/src/app/pages/connections-page.component.ts` (476 L) | Cards for X/IG + manual "website/advanced" form. Uses `watchForCompletion` polling. |
| API client/models | `apps/studio-web/src/app/services/studio-api.service.ts`, `models/studio.models.ts` | `StudioApiService` pattern: `${origin}/studio/api/backend/v2/…`. |
| Connection backend | `src/studio/routes-connections.ts` (200 L), `social-connections.ts` (578 L), `social-provider.ts` (182 L) | Social-only (`/v2/social-connections*`). Website accounts flow through generic `PublishingAccount` CRUD in `routes.ts`. |
| Website publishers | `src/studio/publishers.ts` (1000+ L) — **not** `src/infrastructure/publishing/` | `PublisherAdapter` interface in `src/studio/types.ts:116`; `getPublisher(site)` dispatch by `SiteType` (`guiatv|tecnoria|talkaris|webhook`). |
| Queue producer | `src/infrastructure/queue/producer.ts` (59 L) | Queues: scraping/text/image/publishing/social (`QUEUE_NAMES` in `queue/queues.ts`). Jobs via BullMQ; DB `Job` model holds idempotency + status. |
| Main navigation | `apps/studio-web/src/app/layout/app-shell.component.ts` (377 L) | Grouped nav: Workspace/Publish/Operate + System. Topbar has New content + site/user popovers. |
| Provisioning | `scripts/provision-linked-tenants.ts` (170 L) | Hard-codes Tecnoria, GuiaTV, Talkaris tenant+site definitions. |
| Seeded demo site | `bootstrap-webhook` (baseUrl `https://example.test`) per MILESTONES residual; grep found no current creator — verify in DB during cleanup. |
| SSE | None. M13 records polling-only as known gap. |

## 2. Hard-coded brand/bootstrap paths to remove

1. `scripts/provision-linked-tenants.ts` — hard-coded Tecnoria/GuiaTV/Talkaris provisioning. Replace with parameter-driven provisioning (`--tenant`, `--site`, `--type`, …) + opt-in dev fixtures only.
2. `src/studio/routes.ts` `SITE_TYPES` — keep enum (generic publisher adapters must survive); no brand in UI defaults.
3. Seeded connections: any `PublishingAccount` rows provisioned automatically at bootstrap for real brands must not exist in a clean workspace; add explicit idempotent cleanup admin op.
4. UI: Connections page must not assume specific brands; no fallback selector values referencing Tecnoria/GuiaTV.

## 3. Architecture decisions

### 3.1 Connector registry (M3)
- New `src/studio/connectors/registry.ts`:
  - `ConnectorDescriptor { id, kind: 'website'|'x'|'instagram', name, description, authMethods: AuthMethodDescriptor[], capabilities, configSchema (versioned JSON Schema), discovery: boolean, verificationProbes: ProbeKind[] }`.
  - Registry built from generic adapters: `website.generic_rest`, `website.generic_webhook`, plus social connectors `x.oauth` / `instagram.oauth` mapped onto existing `SocialIntegrationProvider` registry (`social-provider.ts`).
  - Compatibility adapters for guiatv/tecnoria/talkaris remain registered as **capability presets** (auth method + endpoint contract) only, isolated in `connectors/presets.ts`; they never appear as default customer connections.
- New `src/studio/connectors/discovery.ts`:
  - SSRF-safe URL normalization (reuse/extend `web-discovery.ts` + `http-utils.ts` guards): scheme allow-list, no userinfo, no link-local/loopback/private-IP targets (allow override only via explicit env flag), redirect-bounded fetches.
  - Probes: `/robots.txt`, sitemap candidates, homepage meta generators (WordPress/ghost/etc.), `wp-json`, canonical origin, locale (`html lang`), favicon, writable endpoint candidates (e.g. WP application-passwords REST), capabilities. Never marks connected.
- New `src/studio/connectors/verification.ts`: reversible probes per auth method (draft create/update/delete or status-only check), media upload where supported, publish/unpublish probe behind explicit confirmation. Reuses `PublisherAdapter`-style contracts; never publishes public content.

### 3.2 Installation aggregate + state machine (M2/M4)
- Prisma model `ConnectorInstallation`:
  - states: `draft, discovering, credentials_required, verifying, ready, active, failed, expired, disabled, cancelled`.
  - Transition table validated in `src/studio/connectors/installation.ts` (single source of truth), every transition audited via `writeAudit`.
  - Fields: tenantId, siteId?, kind, provider, state, config Json, discovered Json, capabilities Json, credentialsCiphertext (encrypted, write-only) or credentialsRef, lastError, externalAccountId, secretFingerprint, version.
- Async discovery/verification through new BullMQ queue `queue_connections` (add to `QUEUE_NAMES`), stable idempotency keys `tenantId::installationId::phase::hash`.

### 3.3 Operations (M5)
- Prisma model `Operation`: stable public `opId` (UUID) ≠ BullMQ job id; tenant/site scoped; type, status (`queued, running, succeeded, partial, failed, cancelled, retrying`), progress/totalSteps, phase, initiatorUserId, entityType/entityId, retryCount, sanitized errorSummary, timestamps, `queueName`, `jobKey` for correlation.
- `src/studio/operations.ts` service: `createOperation`, `touchProgress`, `completeOperation`, `failOperation`, `markRetrying`, `cancelOperation`. All existing background flows call it: site indexing, discovery, plan generation, text/image/social generation, publishing, connection installation/verification, imports/automation.
- Routes `/v2/operations` (filters/tabs/search/status counts), `/v2/operations/:opId` (detail), `POST /v2/operations/:opId/retry`, `POST /v2/operations/:opId/cancel`.
- UI: `/studio/activity` page + compact topbar activity control.

### 3.4 SSE (M6)
- `GET /v2/events/stream?siteId=` — authenticated via the same signed-studio-context headers (BFF `proxyToBackend` already pipes response streams, so SSE passes through).
- Heartbeat every 25s; `Last-Event-ID` replay from bounded event store (Redis or `studio_events` table with retention), per-tenant/site scoping, backpressure disconnect.
- Angular `SseService` with `EventSource` + visibility-aware polling fallback (`Auctorio-Events`).

### 3.5 Notifications (M7)
- Prisma `Notification` (tenant/user/site scope, type, severity, title, message, entityType/entityId, actionUrl, readAt, archivedAt, dedupeKey unique per tenant) + `NotificationPreference` (per user per category, enabled).
- `src/studio/notifications.ts`: `notify()` with dedupe; emitted from operation lifecycle + connection expiry/health + automation pause. No secrets in bodies.
- Routes `/v2/notifications`, mark read/unread/all-read/archive, preferences, unread count.
- UI: topbar bell (badge, popover preview, live via SSE), `/studio/notifications` inbox.

### 3.6 UX polish (M8)
- Connections page → tabs `All | Websites | Social | Needs attention`, status counts, search, card/table hybrid, `Connect destination` primary action opens wizard.
- Navigation: add `Activity` and `Notifications` under a new group without lengthening sidebar (collapsible groups).
- Global table polish: sticky headers, density, sorting, empty/loading/error states.
- Deep-link query params for tabs/filters.

## 4. Execution order and gates

1. M2 migration `20260826000000_connections_operations_notifications` (additive only).
2. M3 registry + discovery + verification (unit-tested: SSRF, normalization, schema negotiation).
3. M4 installer routes + wizard + `scripts/cleanup-seeded-connections.ts` (idempotent, dry-run, audited) + replace provision script.
4. M5 operation service + correlation + Activity page.
5. M6 SSE + fallback polling.
6. M7 notifications + shell controls.
7. M8 nav/tabs/tables/responsive polish.
8. M9 security review, docs, Graphify refresh, deploy, smoke tests.

## 5. Test plan (mapped to master prompt)

- Unit: `tests/connector-registry.test.ts`, `tests/connection-discovery.test.ts` (SSRF), `tests/installation-state-machine.test.ts`, `tests/operations.test.ts`, `tests/notifications.test.ts` (dedupe), `tests/events-sse.test.ts` (replay/authorization).
- Route: extend `tests/tenant-isolation.test.ts` for operations/notifications/events cross-tenant 404s; secret redaction assertions.
- Worker: connection queue idempotency/retry/cancel tests.
- Angular: component tests for wizard/tabs/bell (Karma or lightweight TestBed) if infra allows; otherwise Playwright coverage.
- E2E: 6 golden paths in `e2e/specs/` per master prompt.

## 6. Risk register

- No X/Meta/Ayrshare credentials in prod env → live OAuth remains blocked; sandbox/mock contract tests must cover the flow.
- `bootstrap-webhook` seeded demo site must be verified against prod DB during cleanup (no broad domain deletes).
- SSE through Angular SSR: use fetch-based streaming with `isPlatformBrowser` guards (SSR tests fail otherwise — known pattern from rebuild).
- Bundle budget 500 kB — wizard + activity + notifications pages must be lazy-loaded.
