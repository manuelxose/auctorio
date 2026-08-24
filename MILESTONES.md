# Auctorio — Milestones

Generated: 2026-08-24 · Branch: main · Head: 9a370bf

Status legend: ✅ complete · 🟡 in progress · ⏸ blocked · ❌ not started

Evidence convention: a milestone is complete only when its acceptance criteria
are satisfied by automated tests, manual validation, or production evidence.
Code presence alone is never sufficient.

---

## M0 — Repository Intelligence ✅

- **Objective**: map the repository, record baseline, initialize project memory.
- **Evidence**:
  - Graph memory present at `graphify-out/` (graph.json + GRAPH_REPORT.md), wired
    via `.gitattributes` merge driver and agent instructions (`CLAUDE.md`, `AGENTS.md`).
  - Repository memory in `/memories/repo/` covers acceptance/deploy, frontend
    rebuild, graph setup.
  - Architecture docs: `docs/auctorio-product-architecture.md`,
    `docs/auctorio-acceptance-2026-08-21.md`, `docs/environment-audit.md`.
- **Baseline tests**: 68/68 unit/integration (pre-pass) → **109/109** after this
  pass. E2E 3/3. Backend build + Studio build pass.
- **Completion criteria**: repo mapped, dead areas identified, baseline recorded ✅

## M1 — Multi-Agent Foundation (RuFlo) 🟡

- **Objective**: replace Claude Flow-era tooling with RuFlo, keep project knowledge.
- **Evidence (2026-08-24)** :
  - RuFlo v3.38.16 installed (`/usr/bin/ruflo`); `ruflo init hooks --minimal`
    installed the helper suite; RuFlo daemon + MCP server running
    (`npx ruflo@latest mcp start` since 22:27, daemon PID 1118183).
  - Memory DB initialized (`.swarm/memory.db`): `memory store/retrieve/list`
    validated with a real project fact (Fastify :4401 / Studio :4400 / 9
    systemd units). Semantic `memory search` returns empty until the vector
    index is warmed — keyword retrieve works (recorded quirk).
  - Swarm primitive validated: `ruflo swarm init -t hierarchical -m 8`
    succeeded; status shows 0 active agents.
  - Claude Flow debris removed from `.claude/settings.json` (env vars + `npx
    @claude-flow*`/`mcp__claude-flow__*` permissions replaced with ruflo).
    `.claude-flow/` runtime dir is the live RuFlo daemon state and is preserved.
- **Remaining**: live agent spawning requires LLM API keys (none configured —
  `ruflo doctor` reports "No API keys found"); run once keys are provisioned.
- **Completion criteria**: swarm/agent/memory validated 🟡

## M2 — Architecture and Data Integrity ✅

- **Objective**: safe migrations, coherent boundaries, no integrity defects.
- **Evidence**:
  - Fixed fresh-deploy blocker: `@@unique([tenantId, idempotencyKey])` re-emitted
    a full unique index colliding with the partial indexes created by
    `20260821110000` / `20260822000000`. Uniqueness now owned by migration
    history; Job model keeps its `@@unique` (created by `20260310160000`).
  - Pinned explicit index name on `publication_attempts` to stop rename churn.
  - New migration `20260824000000_social_connections_and_web_discovery`
    (additive only, 0 drops) applied to production; round-trip on scratch DB:
    12 migrations apply cleanly, **zero residual drift**.
  - Follow-up `findUnique → findFirst` conversions for idempotency lookups.
- **Completion criteria**: tenant model audited, migrations safe ✅

## M3 — Enterprise Security and RBAC ✅

- **Objective**: auth audited, tenant isolation tested, RBAC backend-enforced.
- **Evidence** :
  - New routes enforce `requireStudioPermission("integrations.manage")`; all
    queries tenant-scoped. Credentials AES-256-GCM at rest; Ayrshare tokens
    never stored locally; secrets never exposed to the browser.
  - NEW `tests/tenant-isolation.test.ts` (3 tests): cross-tenant IDOR on
    social connections (list/verify/reconnect/disconnect all 404 for a
    foreign tenant's account), per-tenant discovery configs (A's patch never
    touches B), 409 fail-fast on unconfigured web intelligence.
  - E2E covers multi-site session scoping.
- **Remaining**: dependency vulnerability scan (no automated SCA in CI yet).

## M4 — SaaS Foundation 🟡

- **Objective**: org/workspace UX, memberships, invitations, entitlements, metering.
- **Evidence**:
  - One-login/many-sites model, roles admin/editor, invitations flow
    (`studioInvitations`, `auth/invitations/accept`), usage metering for web
    discovery (queries/scrapes/estimated cost per day).
- **Remaining**: centralized entitlements/capabilities registry (no hard-coded
  plan checks), AI cost metering UI, billing boundaries (no provider required).

## M5 — Connections ✅ (flow) / 🟡 (credentials)

- **Objective**: Connections hub, website/X/Instagram flows, health, reconnect.
- **Evidence**:
  - Provider abstraction + direct (BYO app) and Ayrshare (managed) providers.
  - `/v2/social-connections*`: list, setup requirements, session (state hash +
    PKCE, 15 min TTL, one-time), callback, verify, reconnect, disconnect.
  - Connection states incl. `expired`; periodic worker health checks;
    Studio Connections page with provider status and setup guidance.
  - Production probe: endpoint live, honest "not configured" report (no social
    credentials exist in prod env yet).
- **Blockers**: no X/Meta/Ayrshare credentials in production environment —
  live OAuth round trip cannot be exercised until keys are provisioned.

## M6 — Source Intelligence ✅

- **Objective**: manual sources, AI discovery, source health, dedupe/clustering.
- **Evidence**:
  - Web intelligence (Firecrawl/Tavily), discovery config per tenant, daily
    usage metering, bounded scraping, domain provisioning, blocked domains.
  - Domain quality: 13 dimensions, 5 tiers, spam detection (unit tested).
  - AI discovery planner with strict JSON parsing (unit tested).
  - Routes `/v2/discovery/*` live in production; settings endpoint returns a
    real per-tenant config.
  - Source health: consecutiveFailures, lastFetched/lastSuccess, qualityScore.
- **Blockers**: no `FIRECRAWL_API_KEY`/`TAVILY_API_KEY` in prod env — AI search
  can't run live until a key is provisioned (worker degrades gracefully).

## M7 — Editorial Studio 🟡

- **Objective**: Inbox/editor/evidence/media/SEO/revisions/social/approval.
- **Evidence**: rebuilt Studio (design system v2) covers content, versions,
  QA gate, media library, SEO, version compare; grounded generation with
  evidence; approvals with reviewGate. New: developing-story detection
  (updated content re-enters scoring, clusters marked developing/updated).
- **Remaining**: deep Inbox filters polish, mobile pass on editor.

## M8 — Planning and Automation 🟡

- **Objective**: editorial plan, calendar, automation rules, scheduler, pause.
- **Evidence**: editorial plans migration + UI, calendar, automation policies
  with per-day limits, scheduler worker, pause switch, reviewGate-driven
  scheduled page.
- **Remaining**: plan-level bulk actions and drag-reschedule transactional
  rollback validation.

## M9 — Analytics and Costs 🟡

- **Objective**: AI usage/cost, publication KPIs, social metrics, no fakes.
- **Evidence**: aiAudit table + worker-level usage records; discovery cost
  metering; analytics page reads real data.
- **Remaining**: dashboard aggregation API, per-model cost views.

## M10 — Golden Path ✅ (GuiaTV) / ✅ (Tecnoria — 2026-08-25)

- **Evidence (Tecnoria, live production run)**: RSS source (20 items) → scored
  candidates → project from source item → grounded article (474 words) → QA
  passed → hero image → SEO metadata → X (3) + Instagram (2) derivatives →
  schedule → publish-now → publication `published` (externalId
  `055dfef9-cff6-47b3-a0fe-3e8c79d92283`) → Tecnoria API `status=publish` →
  public URL `https://tecnoriasl.com/blog/…` HTTP 200 (62 KB article) →
  unpublish → publication `unpublished` → Tecnoria API `status=draft`,
  public page no longer serves the article.
- **Bugs found and fixed by the golden path run**:
  1. `tecnoria_publish_failed INVALID_INPUT` — bearer-token auth omitted
     `content-type: application/json`, so Tecnoria's express.json() never
     parsed the body. Fixed in `TecnoriaPublisher.upsert` + regression test.
  2. Unrecoverable retries — the stable (tenant, idempotency_key) unique index
     made the scheduler path fail with P2002 on retry. Fixed
     `enqueueWebsitePublication` and `enqueueUnpublishForWebsite` to
     reset-and-requeue the failed job row instead of creating a duplicate.
- **GuiaTV (2026-08-21)**: full path validated and documented in
  `docs/auctorio-acceptance-2026-08-21.md`.

## M11 — Cross-Tenant Regression 🟡

- **Evidence**: GuiaTV full path green; Talkaris contract unit-tested
  (updateDraft routing); talkaris-blog destination unreachable from VPS
  (operator follow-up). Tenant isolation enforced via session/active-site +
  backend scoping; E2E covers site-scoped content.

## M12 — UX/UI Enterprise Rebuild ✅

- **Evidence**: design system v2 with semantic tokens, dark/light, shared
  primitives, grouped nav, mobile drawer; initial bundle 443.48 kB under the
  500 kB budget; all core screens migrated; E2E selectors aligned; Studio
  release 20260824_225042 live in production.

## M13 — Realtime, Reliability, Observability 🟡

- **Evidence**: structured logs (requestId, tenant, provider), `/health/live`,
  `/health/ready` (storage probe), `/health/destinations`, NEW `/health/queues`
  (per-queue depth: waiting/active/delayed/failed/completed + oldest waiting
  job age, 503 when any queue probe fails), worker/provider health in overview;
  connection health loop; discovery run now fails fast (409) when the web
  intelligence provider is missing and the Settings UI disables the run button.
- **Remaining**: SSE for job/publication events (polling still in place),
  worker-level throughput metrics.

## M14 — Full QA ✅ (current head)

- `npm run typecheck` ✅ · `npm run build` ✅ · `npm run build:studio` ✅
- `node --test dist/tests/**/*.test.js` → **113/113 pass** ✅ (incl. tenant
  isolation, Tecnoria content-type regression, publishers contract suites)
- `npm run test:e2e` → **3/3 pass** against production Studio ✅
- `npx prisma validate` ✅ · `npx prisma migrate deploy` ✅ (prod up to date)
- `npm run test:live:guiatv` → last executed 2026-08-21 ✅

## M15 — Production Deployment ✅ (this pass)

- **Evidence**:
  - Migration `20260824000000` applied to production PostgreSQL.
  - Studio release `20260824_225042` published, SSR 200 + expected content.
  - All 9 `content-ai-*` systemd services restarted and `active`.
  - API health live/ready 200; new routes respond (401 unauth / 200 authed via
    BFF session); structured request logs with reqIds.
  - Workers tick cleanly (`worker:discovery tick ... errors: 0`).
  - Rollback: previous Studio release dir retained; migrations are additive
    with zero drops; backups via `/etc/cron.d/auctorio-backup`.

## Known non-blocking residuals

- `talkaris-blog` destination unreachable from VPS (operator follow-up).
- Seeded demo site `bootstrap-webhook` (baseUrl `https://example.test`) exists.
- No social/web-intelligence provider credentials in prod env (provision keys
  to activate live X/Instagram OAuth and AI source search).
- Analytics depth and billing-ready entitlements remain P1/P2 backlog.

## Milestone closure protocol

Before marking any future milestone complete, the Adversarial Reviewer must
answer: implemented? backend? frontend? persistence? permissions? states?
mobile? meaningful tests? regressions? evidence? — any "no" blocks closure.
