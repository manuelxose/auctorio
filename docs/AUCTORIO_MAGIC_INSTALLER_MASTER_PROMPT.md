# Auctorio — Universal Connection Installer, Job Center, Notifications and UX Polish

You are the principal engineer responsible for completing this work in `manuelxose/auctorio`. Work autonomously from the current `main` branch and do not stop at analysis, scaffolding, mock data, TODOs, or a partially working UI. Implement, migrate, test, visually verify, document, and deploy the complete production-grade result.

## Mandatory context discipline

1. Read `CLAUDE.md`, `AGENTS.md`, `MILESTONES.md`, and the current git status before changing anything.
2. Use the existing Graphify graph first to minimize context and token consumption:
   - verify freshness against `git rev-parse HEAD`;
   - use `graphify query`, `graphify explain`, and `graphify path` for scoped investigation;
   - inspect raw files only after the graph identifies the relevant nodes;
   - regenerate with `graphify update .` after implementation (AST-only, no LLM/API cost).
3. Preserve the working M16–M22 systems. Extend the existing Fastify + Prisma + BullMQ + Angular architecture; do not create parallel connection, queue, or notification frameworks.
4. Never expose credentials to the browser, logs, audit payloads, URLs, screenshots, fixtures, or git. Keep tenant and site scoping on every query and mutation. Enforce permissions in the backend, not only in the UI.

## Verified current-state anchors

- Graph head reviewed: `5bcf1d5174504ceb123a928c6cadd4b68e574b9e`.
- Connection UI: `apps/studio-web/src/app/pages/connections-page.component.ts`.
- API client/models: `StudioApiService` and `studio.models.ts`.
- Connection backend: `src/studio/routes-connections.ts`, `social-connections.ts`, `social-provider.ts`.
- Website publishers: `src/infrastructure/publishing/publishers.ts` and the existing publication workers.
- Queue producer: `src/infrastructure/queue/producer.ts`; current health endpoint already reports queue depth.
- Main navigation: `apps/studio-web/src/app/layout/app-shell.component.ts`.
- Hard-coded provisioning is present in `scripts/provision-linked-tenants.ts` with Tecnoria, GuiaTV, and Talkaris definitions. Domain-specific compatibility code may remain only inside isolated publisher adapters and SEO/domain profiles, never as default customer connections or UI assumptions.
- M13 explicitly records the missing capability: job/publication events still use polling and need SSE.

## Primary objective: universal “Magic Installer”

Replace the current manual/advanced website form and pre-linked brand experience with a reusable, multi-tenant connection wizard that can onboard any supported website and X/Instagram account without code changes.

### Remove hard-coded defaults safely

- Remove Tecnoria and GuiaTV from bootstrap/default/demo provisioning and from every UI default, fallback, selector, test assumption, and automatic connection creation path. They must not appear connected in a clean workspace.
- Do not delete generic adapters or break their existing publishing contracts. A customer may reconnect either domain later through the same universal wizard.
- Replace `scripts/provision-linked-tenants.ts` with generic, parameter-driven provisioning or clearly separate opt-in development fixtures. No real brand/domain may be provisioned merely by running normal bootstrap/deploy commands.
- Create an explicit, idempotent cleanup/admin operation for existing seeded publishing connections. It must target verified tenant/site/account identifiers, show a dry-run, avoid deleting content/publications/site intelligence, revoke or clear connection secrets safely, write audit events, and be safe to rerun. Never use broad domain-name deletes.
- Ensure the production migration/cleanup plan distinguishes: site/workspace identity, publishing destination, social connection, secret reference, and historical publications.

### Wizard experience

Build an accessible responsive stepper or full-page wizard, launched by a prominent `Connect destination` action:

1. Choose destination: Website, Instagram, or X. Use provider capability metadata, not hard-coded cards.
2. Website discovery: enter URL; normalize it; perform SSRF-safe discovery of CMS/API type, canonical origin, sitemap/robots, authentication options, writable endpoint candidates, locale, favicon, and publishing capabilities. Never infer “connected” from a public GET alone.
3. Connection method: present only compatible options such as first-party connector/plugin, OAuth, API token, application password, webhook, or documented generic REST adapter. Advanced/manual configuration is progressive disclosure.
4. Authenticate securely: secrets are write-only, encrypted at rest or referenced from the environment/secret manager. Provide precise provider-specific help without leaking values.
5. Verify: run capability probes for authentication, draft creation/update, media upload, publish, unpublish, taxonomy and canonical URL where supported. Use a reversible draft/sandbox probe; never publish public content without explicit confirmation.
6. Configure: map site, author, categories/tags, locale, default publication mode, approval policy, media behavior, and failure fallback.
7. Review and activate: show discovered capabilities, warnings, unsupported operations, and an honest final status. Persist only after validation; allow save-as-incomplete and resume.

For X and Instagram, preserve the existing provider abstraction, PKCE/state protections, reconnect/verify/disconnect lifecycle, and managed/BYO modes. Make the UX one-click when server-side provider configuration exists and actionable—not a dead button—when it does not.

### Architecture requirements

- Introduce a provider/connector registry with capability descriptors and versioned configuration schemas. UI steps must render from backend metadata so adding a connector does not require editing the page template.
- Define a durable installation aggregate/state machine, for example `draft -> discovering -> credentials_required -> verifying -> ready -> active`, plus `failed`, `expired`, `disabled`, and `cancelled`. Transitions must be validated and audited.
- Run discovery and verification asynchronously through existing BullMQ infrastructure, with stable idempotency keys, retry classification, cancellation where safe, timeouts, and resumability.
- Use the current site-intelligence crawler only through its safe public service boundary; do not duplicate crawling logic.
- Return typed, versioned API envelopes and human-safe errors with stable error codes and remediation actions.
- Preserve compatibility with existing GuiaTV/Tecnoria/Talkaris publisher adapters behind the registry, while providing a truly generic connector path for new sites.

## Secondary objective: Background Job Center

Create a user-facing `/studio/activity` or `/studio/jobs` area and a compact global activity control in the top bar.

- Every meaningful background operation—site indexing, discovery, editorial plan generation, text/image/social generation, publishing/unpublishing, connection installation/verification, imports and automation—must create or correlate to a tenant-scoped durable operation record.
- Present running, queued, scheduled, succeeded, partially succeeded, failed, cancelled, and retrying states with progress percentage or completed/total steps, current phase, start/end time, duration, initiator, related site/content/destination, retry count, and a sanitized error summary.
- Provide filters, tabs, search, status counts, pagination/virtualization, details drawer, deep links to affected objects, retry for retryable failures, and safe cancellation for cancellable work.
- Do not expose raw BullMQ IDs as the product model. Add a stable operation ID and correlate queue jobs, publication attempts, audits and generation attempts behind it.
- Use Server-Sent Events for tenant/site-scoped live updates with authorization, heartbeat, Last-Event-ID replay/reconnect and bounded retention. Fall back to efficient polling with visibility-aware backoff when SSE is unavailable.
- Queue health remains an operator concern; user-visible activity must not leak other tenants or infrastructure internals.

## Secondary objective: Notification Center

Implement a durable in-app notification system connected to operation and domain events.

- Add a top-bar bell with unread badge, popover preview, and a full notification inbox.
- Notify on meaningful outcomes: completed, partially completed, failed/action required, publication result, connection expiry, credentials/permissions required, and automation paused. Avoid noisy per-step notifications.
- Each notification needs tenant/user scope, type, severity, title, concise message, related entity/action URL, created/read/archived timestamps and dedupe key.
- Support mark read/unread, mark all read, archive, filters/tabs and preferences by event category. Enforce RBAC and tenant isolation.
- Toasts remain immediate transient feedback; notifications are persistent. Do not use fake notifications or derive unread state only in memory.
- Emit notification updates over the same authenticated SSE channel and meet accessibility requirements for live regions and keyboard operation.

## UX/UI information architecture polish

Audit all authenticated desktop and mobile screens using the existing Auctorio design tokens and components. Preserve functionality and do not introduce a second design system.

- Reorganize navigation around clear product jobs. Include Activity and Notifications without making the sidebar longer and harder to scan. Use collapsible groups/overflow where appropriate.
- Replace excessive vertical stacking and long one-column pages with contextual tabs, segmented controls, split panes, drawers, accordions and responsive master-detail patterns when they improve comprehension.
- For Connections, use tabs such as `All`, `Websites`, `Social`, and `Needs attention`, plus status counts and a searchable responsive card/table hybrid.
- Improve data tables globally: sticky headers where useful, density suitable for professional software, column priority, sorting, filtering, pagination, empty/loading/error/skeleton states, row actions, bulk actions only where safe, and mobile card transforms. Do not hide essential actions in horizontal overflow.
- Keep URLs/deep links for tabs and filters when users may bookmark or return to a view.
- Validate keyboard navigation, focus management, semantic labels, contrast, reduced motion, touch targets, light/dark themes, 320 px mobile width and common desktop widths.
- Use real data only. No decorative charts, invented metrics, fake histories, or static status demonstrations in production code.

## Delivery milestones

Execute these gates in order. A milestone is not complete until backend, persistence, frontend, permissions, mobile behavior, tests and evidence are all present.

1. Graph-scoped audit and written implementation map; identify all hard-coded brand/bootstrap paths and current queue/job/event flows.
2. Additive Prisma migrations and domain contracts for connector installations, operations, events/notifications and user preferences.
3. Universal connector registry and secure discovery/verification services.
4. Magic Installer API and complete Angular wizard, including resume, failure recovery and cleanup of seeded connections.
5. Operation correlation across all existing background workflows and Activity Center UI.
6. Authenticated SSE event stream with replay/reconnect and polling fallback.
7. Durable Notification Center and global shell controls.
8. Navigation, tabs, tables and responsive UX polish across the Studio.
9. Adversarial security/isolation/reliability review, Graphify refresh, documentation, production deployment and smoke tests.

## Required tests and proof

- Unit tests for connector registry, capability negotiation, URL normalization/SSRF prevention, state transitions, error classification, notification dedupe and operation progress aggregation.
- Route tests for RBAC, IDOR/cross-tenant isolation, invalid transitions, secret redaction, SSE authorization/replay and rate/connection limits.
- Worker tests for idempotency, retries, partial success, cancellation and event correlation.
- Migration test from the current production schema plus rollback/restore instructions; migrations must be additive unless a separately reviewed cleanup step is explicitly executed.
- Angular component tests for wizard steps, resume/error states, tabs, unread state, keyboard/focus behavior and mobile layouts.
- Playwright golden paths:
  1. clean workspace contains no pre-connected Tecnoria or GuiaTV destination;
  2. connect a generic test website through discovery -> authentication -> reversible verification -> activation;
  3. start a background index/generation task, observe live progress, completion and persistent notification;
  4. force a retryable failure, inspect details, retry, and reach success;
  5. connect/reconnect/disconnect social provider using a deterministic sandbox/mock contract;
  6. cross-tenant user cannot read operations, SSE events, notifications or connections from another tenant.
- Run and report exact results for `npm run typecheck`, `npm run build`, `npm run build:studio`, the full unit/integration suite, Prisma validation/migration checks and E2E suite.
- Perform visual QA at 320, 375, 768, 1280 and 1440 px in light and dark modes. Fix overflow, clipping, broken focus, duplicate controls and empty dead space.
- Update OpenAPI/docs, architecture notes, `MILESTONES.md`, and Graphify. Include changed-file inventory, migration IDs, screenshots/evidence, known residual risks and rollback steps.

## Non-negotiable completion rules

- Do not merely rename the existing manual form “Magic Installer.” It must discover, negotiate, authenticate, verify, configure and activate through a reusable provider architecture.
- Do not hard-code Tecnoria, GuiaTV, their IDs, domains, tokens, taxonomy or content rules into generic onboarding, UI, migrations or tests.
- Do not mark a connection healthy without an authenticated capability check.
- Do not report a job as successful when one of its required steps failed; represent partial success explicitly.
- Do not store secrets, SSE payloads or raw provider responses in notification bodies.
- Do not remove historical user content or publication records as part of connection cleanup.
- Do not finish while tests are failing, migrations drift, Graphify is stale, production still shows seeded connections, or core flows depend on mocks.

At the end, return a concise production handoff: outcome, architecture decisions, migrations, removed hardcodes/seeded records, test evidence, deployment status, live smoke-test evidence, and any genuinely external blocker such as missing provider credentials. External credential absence may block only the corresponding live OAuth test; it must not block deterministic sandbox contract coverage or the rest of the implementation.
