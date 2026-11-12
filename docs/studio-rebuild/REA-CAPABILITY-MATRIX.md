# REA capability matrix

Source inspected read-only: `C:\Users\Admin\Documents\workspace\rea` (not modified).

**What the directory actually is:** "BLG", an Express 5 + BullMQ + Angular 22 SSR reconstruction of a public SEO/AI-blog SaaS, built with the REA reverse-engineering toolkit (`rea-agents` 6.8.0, MCP server, 229 tools; see `docs/BLG-REA-CAPABILITY-AUDIT.md`). REA itself is a binary/web analysis tool for developers, not a product with end-user "competencies". No skill registry, agent definitions or chat assistant exist in the BLG app code. Licence: none chosen for BLG; REA is MIT. No BLG code was copied.

| Capability | REA/BLG evidence | Status there | User value | Auctorio equivalent | Decision | Architecture | Priority | Verification |
|---|---|---|---|---|---|---|---|---|
| Capability-based provider routing | `packages/shared/src/ai/router.js` (`resolve(capability)`, bounded retry with jitter) | Real (OpenRouter + mock) | Business code never names a model | `getTextProvider()` + fetch retries | **Adapt (pattern)**: competencies declare *what* they need; the provider stays config-driven | `competencies.ts` | P0 | Copilot ran through mock and an OpenAI-compatible HTTP endpoint unchanged |
| Usage provenance (MEASURED / UNKNOWN) | `apps/worker/src/jobs.mjs` `usage_records.usage_provenance` | Real | No fabricated zero-token costs | `ai_spend_events` (cost required) | **Adopt**: copilot stores tokens only if the provider reports them, else `null`; mock never counts | `copilot.ts` | P0 | Competencies page shows "not reported" for mock, 214/255 tokens for HTTP provider |
| Atomic claim / idempotent jobs | `jobs.mjs` conditional `UPDATE … WHERE status IN (…)` | Real | No double billing | Already in Auctorio (scheduler `SKIP LOCKED`, quality repair locks) | Reject (exists) | — | — | — |
| Failure visible on entity | `worker.on('failed')` writes `last_error` | Real | Nothing fails silently | Exists for jobs/publications | **Adopt for copilot**: failed/cancelled answers persisted with status + error, retryable | `copilot_messages.status/error` | P0 | Failure → Retry verified in browser |
| Deterministic SEO health score | `handleSeoAudit` penalty weights | Partial (scores stored issues only) | Quick objective checks | QA report exists, no ad-hoc SEO check | **Adapt** as `seo-review` competency (title/description length, H1/H2, words, links, alt) | `seoFindings()` | P0 | 2 unit tests + live run on test article |
| Declarative capabilities with permission | — (not present) | Missing | — | Studio permissions exist | **Extend** (Auctorio-native): registry with key, scope, permission, `mutates:false`, intents, loader | `COMPETENCIES` | P0 | `/competencies` API + page, 403 for disallowed |
| Accessible sidebar shell | `apps/web/src/app/shell/app-shell.ts` (skip link, drawer, landmarks) | Real, simple | — | Rebuilt here | Adopt the accessibility baseline only | shell | P0 | Scripted a11y check |
| Tenant isolation via Postgres RLS | `infra/migrations/0001…0011` | Real, tested | Defence in depth | App-level tenant scoping | **Defer**: worth a separate hardening milestone | — | P2 | — |
| Article generation | `content.generate` worker | Real (mock default) | — | Far richer pipeline in Auctorio | Reject (exists) | — | — | — |
| Publishing adapters | `publish.attempt` marks completed without a CMS call | Simulated | — | Real GuíaTV/Tecnoria/WordPress publishers | Reject (simulated) | — | — | — |
| AI visibility, backlinks | `handleAiVisibility`, `handleBacklinkVerify` placeholders | Simulated | — | none | Reject: placeholders, nothing to adopt | — | — | — |
| Dashboard KPIs | `apps/web/src/app/data/demo.ts` labelled demo values | Simulated | — | Overview uses real data | Reject | — | — | — |
| Invitations, sessions, rate limits | `org-routes.mjs`, `auth-routes.mjs`, `rate-limit.mjs` | Real | — | Exist in Auctorio | Reject (exists) | — | — | — |
