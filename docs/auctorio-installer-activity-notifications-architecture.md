# Magic Installer, Activity Center and Notification Center — Architecture

Implemented 2026-08-25 on top of the M16-M22 systems (Fastify + Prisma + BullMQ + Angular Studio).

## 1. Universal connection installer

### Connector registry (`src/studio/connectors/registry.ts`)
- `ConnectorDescriptor` per connector: id, kind (`website|x|instagram`), auth methods, capabilities, versioned JSON config schema, verification probe plan, `requiresDestinationUrl`.
- Registered connectors: `generic_rest`, `generic_webhook`, `x_oauth`, `instagram_oauth`.
- The Studio wizard renders every step from this metadata (`GET /v2/connectors/capabilities`); adding a connector requires no page-template edits.
- Social OAuth availability is computed from server-side provider configuration; unready connectors return an actionable hint instead of a dead button.

### Discovery (`src/studio/connectors/discovery.ts`)
- URL normalization (scheme, credential stripping, canonical origin) + SSRF-safe validation (reuses `infrastructure/scraping` DNS/private-IP guards, plus IP-literal handling).
- Probes only public read-only endpoints: homepage meta/generator detection (WordPress/Ghost/Webflow/Wix/Shopify), `robots.txt`, sitemap candidates, REST roots (`wp-json`), locale, favicon, auth option candidates, publishing capability hints. A public GET never implies "connected".

### Verification (`src/studio/connectors/verification.ts`)
- Reversible probes: authentication check, sandbox draft roundtrip (created then deleted), media endpoint check, signed non-publishing webhook probe. Never publishes public content.

### Installation aggregate (`src/studio/connectors/installation.ts`)
- `connector_installations` table with validated state machine `draft → discovering → credentials_required → verifying → ready → active` plus `failed`, `expired`, `disabled`, `cancelled`; every transition is audited.
- Credentials are write-only: AES-256-GCM ciphertext + fingerprint; views never return secrets. Resume/save-as-incomplete supported; the wizard restores step + state.

### Activation
- Website: creates/links a `Site` (`webhook` or `generic_rest` type) behind the installation; the existing publication pipeline then picks it up via `getPublisher`.
- `GenericRestPublisher` / `GenericWebhookPublisher` resolve credentials from the active installation (env-ref fallback preserved).
- Social: delegates to the existing `SocialIntegrationProvider` OAuth flow (PKCE/state preserved); activation validates the connected account.

### Async execution
- New `queue_connection` (BullMQ) + `content-ai-worker-connection.service`; discovery/verification run in the queue with stable job ids, retry classification and correlated operations.

## 2. Activity Center (operations)

- `operations` table + `src/studio/operations.ts`: stable UUID operation ids (never raw BullMQ ids), tenant/site scope, type, status (`queued|running|retrying|succeeded|partial|failed|cancelled`), progress/total/completed steps, phase, initiator, related entity, retry count, sanitized error summary, `queueName` + `jobKey` correlation.
- Correlation points: text/image generation (orchestration), publishing (web + social), site indexing, editorial plan generation, connection installation/verification. Worker hooks (`operation-hooks.ts`) complete/fail the correlated operation.
- Routes `/v2/operations` (+ filters, search, status counts), detail, retry (requeues the correlated queue job for retryable failures), cancel (removes cancellable queue jobs). UI: `/studio/activity` with tabs, progress bars, detail drawer, retry/cancel.

## 3. Realtime events (SSE)

- `src/studio/events.ts`: Redis Streams per tenant (`studio:events:{tenantId}`, MAXLEN ~500) with sanitized payloads (JWT/token redaction) — cross-process for API + workers.
- `GET /v2/events/stream`: authenticated via the signed studio context (the Studio BFF streams the response), heartbeats every 25s, `Last-Event-ID` replay, per-connection rate limit, tenant/site scoping.
- Angular `SseService`: EventSource with visibility-aware polling fallback over `/v2/operations`.

## 4. Notification Center

- `notifications` + `notification_preferences` tables, `src/studio/notifications.ts`: tenant/user/site scope, category, severity, title/message, entity link, read/archived timestamps, `(tenantId, dedupeKey)` idempotency; bodies sanitized (never secrets or raw provider responses).
- Emitted from operation outcomes, connection install/verify/expiry, cancellation. Routes for inbox, mark read/unread, read-all, archive, preferences. UI: topbar bell with badge + popover, `/studio/notifications` inbox with category tabs and preferences.

## 5. Provisioning and cleanup

- `scripts/provision-linked-tenants.ts` is now parameter-driven (`--tenant/--site-key/...`) with opt-in fictitious fixtures (`--fixtures`); no brand is provisioned implicitly.
- `scripts/cleanup-seeded-connections.ts`: explicit-id target cleanup with `--dry-run`, never deletes accounts with historical publications (disables + clears secrets instead), never touches sites/content/intelligence, audits every action, safe to rerun.

## Residual risks

- No X/Meta/Ayrshare credentials in production — live social OAuth remains blocked; capability view reports this honestly and sandbox contract tests cover the flow.
- DeepSeek output variance can still under-produce editorial plans (documented, bounded top-up; E2E retried green).
- `bootstrap-webhook` demo site (if still present in prod DB) is a site identity record; the cleanup script disables/clears secrets only when targeted with explicit identifiers.
