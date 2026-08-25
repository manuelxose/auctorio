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

---

# M16–M22 — Site Intelligence → Editorial Planning → SEO Content Engine Rebuild

Executed 2026-08-25 against `f027ce5..4d77e9c`. Multi-agent role decomposition
(Repository Architect, Site Intelligence Architect, SEO Strategy Architect,
Editorial Planning Architect, AI Reliability Engineer, Content Engine Engineer,
Editor UX Engineer, Publishing Contract Engineer, Adversarial Reviewer) was
executed sequentially by the primary model — live RuFlo LLM agent spawning is
unavailable (no provider keys); the limitation is recorded. RuFlo memory/project
state, Graphify, repository memory and existing docs were used.

## M15 — Production Deployment ✅ (2026-08-24, prior pass)

- Migration `20260824000000` applied to production PostgreSQL.
- Studio release `20260824_225042` published; all 9 services active.

## M16 — Site Intelligence Foundation ✅

- **Backend** (`src/studio/site-intelligence/`): sitemap discovery with
  `/sitemap.xml`, `/sitemap_index.xml`, `robots.txt` and nested index recursion
  (depth + entry caps, dedupe, cross-origin blocking, malformed-XML failure
  isolation); page crawler with SSRF-safe validation, boilerplate removal,
  canonical/headings/content/JSON-LD/OG extraction, word counts, internal-link
  capture, content-hash change detection; deterministic profile synthesis with
  GuiaTV platform/sports/commercial lexicons and topic clustering.
- **Persistence**: migration `20260825000000_site_intelligence` — additive
  tables `site_sitemaps`, `site_indexed_pages`, `site_topic_clusters`,
  `site_entities`, `site_internal_links`, `site_intelligence_profiles`,
  `search_targets`, `editorial_plan_generation_attempts`; tenant/site scoped.
- **Routes**: `/v2/site-intelligence/:siteId` (overview), `POST …/index`
  (`wait`/`crawl`/`budget` options, background-safe), `GET …/pages`.
- **Studio UI**: Site Intelligence page (overview, topic map, page inventory
  search, index actions) inside Connections; planner step 3 shows live index
  stats and blocks generation when intelligence is missing.
- **Tests**: sitemap/index/malformed/nested/dedupe parsing, SSRF blocking, page
  extraction, content-type inference, tenant isolation (Guiatv vs Tecnoria).
- **Live evidence (GuiaTV)**: repeated production indexes via the golden path;
  planner context reported `indexedUrls: 36, profileVersion: 14`,
  `detectedSiteType` contains `tv`, real topic clusters and link inventory.
  E2E step 1 asserts sitemaps discovered + extracted pages + TV site type.

## M17 — Reliable Structured AI ✅

- **AI layer** (`src/infrastructure/ai/structured.ts`): `generateStructured<T>`
  with versioned JSON-schema validation, provider-native JSON mode, safe
  extraction, controlled repair, one corrective retry with validation errors,
  truncation-aware retry (`finish_reason=length` triggers a compactness
  retry instead of trusting repaired payloads), typed
  `StructuredOutputError` + per-attempt observability (provider, model,
  attempt, finish reason, token usage, schema validation, repair/retry flags).
- **Planner schema**: `EditorialPlanGenerationSchemaV2` (prompt v2.1).
- **Persistence**: `editorial_plan_generation_attempts` records every attempt.
- **Error UX**: raw parser errors never reach editors; the route maps failures
  to a friendly message with a normalized code in the plan record.
- **Tests** (`structured-output.test.ts`): perfect JSON, fenced JSON, trailing
  text, missing comma, truncated response, wrong enum, invalid date, excessive
  rows, duplicate title, unknown property, retry succeeds/fails.

## M18 — Enterprise Editorial Planning ✅

- **Context**: `buildEditorialPlanningContext(siteId)` loads the site profile,
  ranked indexed pages, cluster data, search targets, existing plans/projects
  and source evidence — strictly site-scoped (regression-tested).
- **Briefs**: every plan row is a full SEO brief (primaryIntent,
  secondaryIntents, contentType, funnel stage, target query, primary/secondary/
  semantic keywords, related entities, questions, competitor angle, slug, SEO
  title/description, internal links from the real inventory, evidence types,
  FAQ candidates, schema types, outline, word targets, difficulty/opportunity/
  relevance/cannibalization/confidence, rationale, source evidence).
- **Guardrails**: deterministic relevance scoring (off-topic hard-reject
  lexicon, topic overlap, TV-domain affinity, sports affinity, cluster and
  content-type fit, intent fit, query fit) with threshold 45; cannibalization
  classification (none / related-cluster / update-existing / merge-candidate /
  high) against indexed URLs, search targets and existing plan queries.
- **Reliability**: batched generation (2 items/call under the provider output
  cap), truncation retries, cross-batch exact + near-duplicate detection
  (token overlap ≥0.75), bounded top-up rounds, chunk failure tolerance,
  background (async) generation with plan polling.
- **Studio UX**: 5-step planner (period/site → strategy → intelligence summary
  → generation progress → review) with expandable briefs, editing, bulk
  actions and relevance/cannibalization visibility.

## M19 — SEO Content Engine V2 ✅

- **Generation profiles** per content type (guide/ranking/where-to-watch/news/
  sports/comparison…) with intent-aware word targets (600–4500 by format) and
  token scaling in the text worker; brief fields flow into project metadata.
- **QA V2** (`runVersionQaV2`): 24 explainable checks across structural / SEO /
  editorial / evidence / publishing groups with error|warning|info severities
  and a weighted score; errors block publication.
- **Internal linking engine**: suggestions come from real indexed pages
  (`site_indexed_pages` / `site_internal_links`), never invented.

## M20 — Professional Rich Editor ✅

- `au-rich-editor` component (H2/H3, bold/italic, lists, blockquote, link,
  table, clear formatting, undo/redo, word/char count, reading time, heading
  outline, autosave, dirty indicator, paste cleanup) replaces the raw
  textarea; SSR-safe and within the bundle budget.
- SEO workspace: metadata editor with length gauges, strategy fields, content
  analysis findings, explainable score (`SEO readiness: 82/100`), Google-style
  SERP preview.

## M21 — Publishing Fidelity ✅

- Allowlist HTML sanitizer; semantic structure (h2/h3/strong/em/ul/ol/a/
  blockquote/table) preserved through the editor → version → GuiaTV payload.
- Round-trip unit tests + live draft: GuiaTV `draft_synced` with externalId and
  externalUrl (E2E step 4).

## M22 — Golden Path & Production ✅

- **Golden path E2E (live production)** `e2e/specs/guiatv-seo-golden-path.spec.ts`:
  1. index GuiaTV → real sitemaps + pages + TV profile ✅
  2. SEO-growth plan → site-aware briefs above relevance threshold ✅
  3. approve row → generate → QA passed → semantic HTML ✅
  4. approve version → publish draft → GuiaTV `draft_synced` ✅
- **Regression E2E**: studio workflow (login/site switching/content) 3/3 ✅
- **Validation**: typecheck ✅ · build ✅ · build:studio ✅ ·
  174/174 unit tests ✅ · `prisma validate` ✅ · prod migrations up to date ✅
- **Production**: migration `20260825000000` + brief-columns migration applied;
  API + all 9 workers restarted (running new code, verified); health 200.
- **Bugs found & fixed by the golden path** (with regression tests):
  1. `/TODO/i` placeholder regex matched Spanish "todo" → every ES article
     failed QA. Fixed to word-boundary, case-sensitive patterns.
  2. Model leaked the title as plain text before the first `<p>`; added
     `stripLeadingDuplicateTitle`.
  3. DeepSeek output cap (~4096 tokens) truncated 7-item plans
     (`finish_reason=length`) → batched generation + truncation retry +
     compactness/diversity instructions.
  4. Sparse early-crawl profiles under-scored legitimate topics → synthetic
     site-type lexicon blend + strategy-requested format allowance + sports
     affinity.
  5. Model repeated near-identical topics across batches → token-overlap
     near-duplicate detection + subject-space guidance + bounded top-up rounds.
  6. Long LLM pipelines timed out on the request path → async generation with
     plan polling; draft publication terminal status documented
     (`draft_synced`); approval gate documented in the golden path.

## Known non-blocking residuals

- `talkaris-blog` destination unreachable from VPS (operator follow-up).
- Seeded demo site `bootstrap-webhook` (baseUrl `https://example.test`) exists.
- No social/web-intelligence provider credentials in prod env (provision keys
  to activate live X/Instagram OAuth and AI source search).
- Analytics depth and billing-ready entitlements remain P1/P2 backlog.
- Provider-side output variance: plan quantity is best-effort bounded recovery
  (batches + top-up); every surviving row is schema-valid and above the
  relevance threshold.

## Milestone closure protocol

Before marking any future milestone complete, the Adversarial Reviewer must
answer: implemented? backend? frontend? persistence? permissions? states?
mobile? meaningful tests? regressions? evidence? — any "no" blocks closure.

---

# M23–M31 — Universal Magic Installer, Activity Center, Notifications, UX Polish

Executed 2026-08-25 against `43c1c2e8..43c1c2e8ec0b4394ea59708a8d6be406f367a4d0` following
`docs/AUCTORIO_MAGIC_INSTALLER_MASTER_PROMPT.md`. Single primary agent;
Graphify scoped the audit (see `docs/auctorio-magic-installer-implementation-map.md`).

## M23 — Graph-scoped audit and implementation map ✅
- Written map: `docs/auctorio-magic-installer-implementation-map.md`.
- Corrected stale anchors (`publishers` live in `src/studio/publishers.ts`,
  not `src/infrastructure/publishing`); hard-coded brand/bootstrap paths
  identified (provision script, legacy website-account form assumptions).

## M24 — Additive migrations and domain contracts ✅
- `20260826000000_connections_operations_notifications`: `connector_installations`,
  `operations`, `notifications`, `notification_preferences` (+ enums). Additive only.
- `20260826010000_generic_rest_site_type`: `SiteType.generic_rest` (ALTER TYPE ADD VALUE).
- Residual index-name drift (`site_internal_links`) fixed inside the first migration; prod zero drift.
- Prisma validate ✅ · migrate deploy applied to production ✅.

## M25 — Connector registry, secure discovery and verification ✅
- `src/studio/connectors/{registry,discovery,verification,installation}.ts`.
- SSRF-safe normalization + DNS/private-IP blocking (reuses scraping guards).
- Reversible verification probes (auth, sandbox draft roundtrip, media, signed webhook probe).
- Tests: `connector-registry`, `connection-discovery` (SSRF), `installation-state-machine`
  (transitions, secret redaction, audit), route RBAC/IDOR/redaction suites.

## M26 — Magic Installer API and Angular wizard ✅
- Routes `src/studio/routes-connectors.ts` (capabilities, discover, CRUD, credentials,
  verify, activate, social-session, cancel/resume, delete) + `queue_connection` worker.
- `GenericRestPublisher` added to `publishers.ts`; webhook publisher resolves installation secrets.
- Studio: Connections hub (tabs All/Websites/Social/Needs attention, search, counts,
  deep-link query params, table→card mobile transform) + 6-step wizard
  (`connection-wizard-page.component.ts`) with resume/failure recovery and save-as-incomplete.
- Provisioning: `scripts/provision-linked-tenants.ts` now parameter-driven with opt-in
  fictitious fixtures; `scripts/cleanup-seeded-connections.ts` (dry-run, audited,
  never deletes accounts with historical publications).
- E2E golden paths 1+2 live: no seeded brand connections; website discovery → credentials →
  reversible verification → activation (5/5 installer specs green in production).

## M27 — Operation correlation and Activity Center ✅
- `src/studio/operations.ts` + correlation in orchestration (text/image), publishing
  (web + social), site indexing, editorial plan generation, installer queues;
  worker `operation-hooks.ts` completes/fails the correlated operation.
- `/v2/operations` list/detail/retry/cancel (retry requeues the correlated queue job).
- Studio `/studio/activity`: status tabs with counts, search, progress, pagination,
  details drawer, retry/cancel; live refresh via SSE.
- Tests: `operations.test.ts` (lifecycle, progress math, classification, idempotent
  job-key correlation, tenant scoping).

## M28 — Authenticated SSE with replay and fallback ✅
- Redis Streams event bus (`src/studio/events.ts`, sanitized payloads, bounded retention).
- `GET /v2/events/stream` with heartbeats, Last-Event-ID replay, rate limit, tenant/site scope;
  BFF streams the signed response through.
- Angular `SseService` with visibility-aware polling fallback.
- Tests: SSE authorization (401 unauthenticated), tenant scoping.

## M29 — Notification Center and shell controls ✅
- `src/studio/notifications.ts` (dedupe, sanitization, preferences) + `/v2/notifications*` routes.
- Emissions: installer verify/activate, operation cancel, worker/operation outcomes.
- Topbar bell with unread badge + popover preview; `/studio/notifications` inbox with
  category tabs, unread/archived filters, mark read/all/archive and per-category preferences.
- Tests: `notifications.test.ts` (dedupe, secret redaction, read/archive, preferences).

## M30 — Navigation and responsive polish ✅
- Activity added to the Operate nav group; notifications via bell (sidebar not lengthened).
- Connections tabs, activity tabs/segments, mobile table→card transforms, sticky headers,
  skeletons, empty states, drawer, deep-link query params.
- Visual QA: 40 screenshots at 320/375/768/1280/1440 × light/dark — 0 horizontal overflow
  (evidence in `test-results/visual-qa/`); initial bundle 499.98 kB (budget 500 kB).

## M31 — Security review, deployment and smoke tests ✅
- Adversarial checks: secret redaction in views/events/notifications, cross-tenant 404s,
  invalid transition 409s, SSRF blocks, rate-limited SSE, write-only credentials.
- Validation: typecheck ✅ · build ✅ · build:studio ✅ · 201/201 unit/integration ✅ ·
  Prisma validate ✅ · migrate deploy ✅ · E2E installer 5/5 ✅ · studio regression 3/3 ✅ ·
  guiatv golden path 3/4 first run, 1/1 on retry (documented DeepSeek output variance).
- Production: migrations applied; API + all workers restarted; new
  `content-ai-worker-connection.service` active; Studio release deployed;
  health/ready + health/queues 200.
- OpenAPI updated (`docs/openapi.yaml`), architecture doc
  `docs/auctorio-installer-activity-notifications-architecture.md`, Graphify refreshed.

## Known non-blocking residuals (unchanged)
- No X/Meta/Ayrshare credentials in prod env — live social OAuth blocked; sandbox contract
  coverage + honest capability reporting in place.
- `talkaris-blog` destination unreachable from VPS.
- DeepSeek plan-quantity variance (bounded top-up documented; retried green).
