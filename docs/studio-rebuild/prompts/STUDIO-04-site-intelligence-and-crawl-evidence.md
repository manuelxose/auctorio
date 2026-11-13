# AUTORIO STUDIO IMPLEMENTATION MILESTONE
You are a Principal SaaS Product Architect, Staff Full-Stack Engineer, Publishing Systems Engineer, Technical SEO Specialist, Senior UX/UI Designer and Multi-Agent Program Director. Treat the actual repository as the source of truth; this prompt is grounded in GitHub main commit 173ecf037a358fc0360d718f1e8393d846ec3cd1 inspected 2026-11-13, but you MUST revalidate current HEAD and user worktrees. This prompt is independently executable in a fresh Claude Code conversation; do not invent facts or passing tests.

Auctorio is an Angular 20 SSR + Fastify/Prisma/PostgreSQL + Redis/BullMQ AI-assisted editorial SaaS. Existing canonical entities include Site, ConnectorInstallation, PublishingAccount, AutomationPolicy, EditorialPlan/Item, ProductionJob, ContentProject/Version, Publication and Operation. Read docs/studio-rebuild/INDEX.md, 01-REPOSITORY-ARCHITECTURE.md, 07-END-TO-END-PUBLISHING-WORKFLOW.md and 12-ACCEPTANCE-AND-REGRESSION-MATRIX.md if present. Reuse services, do not rebuild indiscriminately.

Tooling contract: inspect available skills first; actually read/use ui-ux-pro-max and unslop if installed. Work with real parallel delegated specialists/worktrees when available; never pretend to have multiple agents. Inspect the local Studio with Playwright and capture screenshots; if unavailable mark UI checks BLOCKED. REA refers only to a local reconstructed-product reference folder, not a skill to install. Preserve uncommitted and unrelated changes; coordinate shared files. No production deploy, content publication, credential rotation, DB reset, destructive migration or unrelated merge. Request explicit permission for those actions. Technical implementation work in English; user-facing report in Spanish.
Test destination contract (authoritative, overrides any other site/account mentioned below): ALL runtime, Playwright, e2e and live checks use the site guiaprogramaciontv.com (local Site key `guiatv-editorial`, name GuiaProgramacionTV, baseUrl https://guiaprogramaciontv.com). Its connector token is the env var GUIATV_AUCTORIO_ADMIN_KEY, already present in the gitignored .env and verified valid on 2026-11-13: REUSE it, NEVER create, rotate or request a new token, and never print it in logs, commits, screenshots or reports. Live writes against the destination are limited to the draft create/delete key check; never leave content published (the stock npm run test:live:guiatv publishes briefly and expects 403 where the site returns 401, so prefer the draft-only check). Other tenants/sites are out of scope unless a prompt says otherwise.

## 1. MILESTONE IDENTITY
- ID: STUDIO-04
- Title: Rebuild Site Intelligence around representative evidence and credible SEO
- Priority: P1
- Functional area: Crawl, strategy, Site Intelligence screen
- Dependencies: STUDIO-01
- Expected final state: A user can trust that site analysis covers representative sections, distinguishes discovered/crawled/extracted URLs and leads to actionable strategy.

## 2. MISSION
A user can trust that site analysis covers representative sections, distinguishes discovered/crawled/extracted URLs and leads to actionable strategy. Deliver functional changes, verified tests, evidence and an independent critique; superficial rearrangements and fabricated UI are forbidden.

## 3. VERIFIED CURRENT IMPLEMENTATION
Repository paths and symbols to inspect (line numbers refer to the audit baseline, verify again):
- src/studio/site-intelligence/sitemap.ts
- src/studio/site-intelligence/crawler.ts
- src/studio/site-intelligence/profile.ts
- src/studio/site-intelligence/cluster-coverage.ts
- src/studio/site-intelligence/strategy.ts
- src/studio/site-relevance.ts
- src/studio/routes-site-intelligence.ts
- apps/studio-web/src/app/pages/site-intelligence-page.component.ts
- apps/studio-web/src/app/services/intelligence-api.service.ts
- docs/acceptance/guiatv-local-2026-11-12.md
Relevant verified observations from the audit:
- GuíaTV 12-Nov: 4192 discovered URLs, 199 crawled/extracted, 187 movie pages; primary TV schedules/series/channels not adequately inspected.
- Site Intelligence UI currently edits strategy and displays indexed-page data; backend has versioned approved strategy and a crawl endpoint.
- site-relevance.ts scores known clusters (+15) by matching detected profile names/slugs, which need not match approved pillar names.
These are CODE/HISTORICAL-EVIDENCE findings, not necessarily observations of the user's current browser or DB. Read audit docs for exact provenance. Compare Git history and migrations before editing.

## 4. PROBLEMS TO RESOLVE
- Sitemap order and crawl cap bias topic detection; legal/info routes become topic clusters.
- 'Pages indexed' can mislead if it means sitemap-inventoried not confirmed Google indexed.
- Opportunity/strategy may use sampled evidence of insufficient representation and untraceable confidence.
Classify each as CONFIRMED CODE, HISTORICAL TEST or CURRENT RUNTIME HYPOTHESIS. Capture root cause and impact before writing fixes. Do not declare a user-specific runtime problem resolved on a theoretical code change alone.

## 5. TECHNICAL IMPLEMENTATION PLAN
1. Preserve safe SSRF/crawl restrictions; add deterministic section-aware sample budget, stratification with min per route family, crawl policy for sitemap-only/disallowed/dead pages and persistent cursor/resume.
2. Use route/path taxonomy and actual HTML evidence to distinguish editorial content from legal/utility pages, dedupe canonical URLs and normalize locale.
3. Store/report discovered, fetched, extracted and analyzeable counts distinctly, with sample size/sections/last-run/failed URLs; never claim Google indexation without Search Console.
4. Align SiteTopicCluster with SiteEditorialStrategy pillars via auditable alias/mapping, preserving detection and approval as separate layers. Avoid fragile hardcoded TV assumptions in global pipeline.
5. Implement actionable UI tabs: Overview, Coverage, SEO signals, Opportunities, Strategy, Evidence/history; move crawl advanced budgets/diagnostics to Advanced while maintaining access.
6. Ensure approved strategy is versioned and never silently overwritten by recrawl; add call-to-action into Editorial Plan with provenance.
Implementation discipline: derive precise API and state contracts from the existing models; protect tenant/site ownership; use additive migrations only if necessary with backfill and rollback. Add structured logs and human-actionable failure codes. Protect performance by avoiding duplicate reloads and N+1 calls. Use bounded retry/idempotency for side-effecting operations. Before removing any obsolete UI, trace its route, handlers, permissions and data usage.

## 6. UX/UI REQUIREMENTS
Site selector inherited from shell with state; summary says what was actually read, not fabricated; expandable evidence and last analyzed timestamp; accessible filters and guidance for no crawl/no GSC.
Use actual ui-ux-pro-max and unslop processes when available, follow current brand and design tokens, reuse shared components. Define primary CTA, secondary actions, loading/empty/error/success/partial states, keyboard/focus/ARIA, mobile layout and progressive disclosure. Show current vs changed screenshots before claiming UX PASS.

## 7. SEO REQUIREMENTS
Crawlability != indexability != Google indexed; keyword search volume, ranking and GSC clicks only from authorized integration. Show inferential opportunity with reason, URL sample and confidence.
Never manufacture volume, KD, rankings, GSC metrics or confirmed indexation. Label estimates and evidence dates. Respect existing public readable-semantic URL standards.

## 8. CROSS-SYSTEM INTEGRATIONS
GET/POST /v2/site-intelligence/:siteId and /v2/sites/:siteId/strategy; handoff evidence to Sources and Editorial Plan without duplicating strategy.
Confirm effect on GuíaTV and other arbitrary website destinations, historical automation modes, Sources, Editorial Plan, Content, Calendar, background jobs and role permissions. Preserve contract compatibility and explicit user action boundaries.

## 9. DATA INTEGRITY AND SECURITY
Keep SiteIndexedPage and existing strategy versions; no destructive crawl reset; rate limits, robots controls and SSRF-safe URL guards.
No secrets in logs/commits/prompts/screenshots. Ensure RBAC and server-side tenant filtering, SSRF-safe web access, safe HTML, provider rate limits, rollback and historical IDs preservation.

## 10. TEST PLAN
- tests/site-intelligence.test.ts, tests/site-strategy.test.ts, tests/site-onboarding.test.ts
- Fixture with 6 GuíaTV path groups and a giant /peliculas sitemap; verify representative sampling under same page budget
- E2E labels: discovered vs extracted, strategy version/restore, no-GSC state, keyboard filters
Repository commands: npm run typecheck; npm run build:studio; npm test (WARNING: invokes Prisma migrate deploy, run ONLY on an isolated test DB); npm run test:e2e. Use narrower targeted commands when appropriate; inspect package.json and actual Jest/Jasmine/Node/Playwright configuration. Never claim a test passed without running it.

## 11. OBJECTIVE ACCEPTANCE CRITERIA
- Under the same 199-page sample budget, tests ensure representative extraction of /canales, /series, /programas, /programacion-tv, /guias and /deportes when present.
- Legal pages never generate an editorial cluster solely by their URL/title.
- A full recrawl preserves approved strategy and provenance; statistics are truthful.
- No misleading Google indexed metrics without Search Console data.
Attach exact endpoints, persisted entity transitions, sanitized response fragments, Playwright traces and reproducible steps. PASS only on verified behavior; remaining unavailable tools must be BLOCKED with explanation.

## 12. NON-REGRESSION GUARANTEES
Retain sitemap parsing, robots/SSRF protections and site-specific approved strategy; avoid mass deletion of existing indexed page records.
Explicitly check tenant isolation, legacy site integrations, content/plan identity, scheduler, stored credentials, audit trails and publishing rollback. Do not silently remove feature capabilities because they are buried in a monolithic screen.

## 13. INDEPENDENT REVIEW
Use a distinct specialist or a clearly separate adversarial verification pass; never represent self-review as delegated independent work. Check functional correctness, architecture, UX/accessibility, SEO truthfulness, security, data integrity and regression. Require review findings with severity, filename, test evidence, fix and re-test. Only close a P0 on independently reproducible proof.

## 14. DELIVERABLES
- Actual implementation commits in a dedicated feature branch/worktree if this is a code milestone; no direct main edits.
- Tests, API contract diffs, migration/backfill/rollback notes, screenshots at 1440/1024/390 when UI changed, test logs.
- Updated docs/studio-rebuild baseline, feature ownership and acceptance matrix.
- Exact git SHA, PR URL (if authorized to open), changed files and Spanish executive summary. No merge/deploy without express permission.

## 15. DEFINITION OF DONE
Report each separately with evidence: IMPLEMENTATION, FUNCTIONALITY, UX/UI, ACCESSIBILITY, SECURITY, INTEGRATION, REGRESSION, PRODUCTION READINESS. Values only PASS / PARTIAL / BLOCKED / FAIL. A single PASS is not a substitute for dimension-level proof. Production readiness cannot PASS while external credentials/live permissions or deployment validation remain unavailable.

## 16. EXECUTION RULES
Reinspect current repo and clean/dirty worktrees; use real available skills and delegation; investigate first, implement after proof, preserve unrelated changes; run actual tests and browser checks; document blockers, fix safe defects and retest; no superficial patching, mocks disguised as live behavior, unverified success claims, live publishing or deploying without authorization. Commit only related files. Work through safe remediations until objective acceptance or a genuinely external blocker is documented.

## 17. CONTINUATION CONTEXT
Prior dependencies: STUDIO-01. Read prior milestone's evidence, contract docs and migration notes; verify its actual verdict rather than trusting a headline. Expected handoff to the next milestone: Provide high-signal topic profile, excluded categories, representativeness report and links for STUDIO-05/06.
At end produce Spanish report: current status, root causes, code changes, tests run, evidence URLs/paths, independent review, remaining risks, exact next prompt and dimension-level verdicts.
