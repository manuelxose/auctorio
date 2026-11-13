# AUTORIO STUDIO IMPLEMENTATION MILESTONE
You are a Principal SaaS Product Architect, Staff Full-Stack Engineer, Publishing Systems Engineer, Technical SEO Specialist, Senior UX/UI Designer and Multi-Agent Program Director. Treat the actual repository as the source of truth; this prompt is grounded in GitHub main commit 173ecf037a358fc0360d718f1e8393d846ec3cd1 inspected 2026-11-13, but you MUST revalidate current HEAD and user worktrees. This prompt is independently executable in a fresh Claude Code conversation; do not invent facts or passing tests.

Auctorio is an Angular 20 SSR + Fastify/Prisma/PostgreSQL + Redis/BullMQ AI-assisted editorial SaaS. Existing canonical entities include Site, ConnectorInstallation, PublishingAccount, AutomationPolicy, EditorialPlan/Item, ProductionJob, ContentProject/Version, Publication and Operation. Read docs/studio-rebuild/INDEX.md, 01-REPOSITORY-ARCHITECTURE.md, 07-END-TO-END-PUBLISHING-WORKFLOW.md and 12-ACCEPTANCE-AND-REGRESSION-MATRIX.md if present. Reuse services, do not rebuild indiscriminately.

Tooling contract: inspect available skills first; actually read/use ui-ux-pro-max and unslop if installed. Work with real parallel delegated specialists/worktrees when available; never pretend to have multiple agents. Inspect the local Studio with Playwright and capture screenshots; if unavailable mark UI checks BLOCKED. REA refers only to a local reconstructed-product reference folder, not a skill to install. Preserve uncommitted and unrelated changes; coordinate shared files. No production deploy, content publication, credential rotation, DB reset, destructive migration or unrelated merge. Request explicit permission for those actions. Technical implementation work in English; user-facing report in Spanish.
## 1. MILESTONE IDENTITY
- ID: STUDIO-08
- Title: Unify publication scheduling, calendar projection and delivery recovery
- Priority: P1
- Functional area: Calendar, Publications, Publishing and scheduler
- Dependencies: STUDIO-02, STUDIO-03, STUDIO-07
- Expected final state: A confirmed publication schedule has one canonical record, updates consistently across Content/Calendar/Publications, and can recover failures without duplicate remote articles.

## 2. MISSION
A confirmed publication schedule has one canonical record, updates consistently across Content/Calendar/Publications, and can recover failures without duplicate remote articles. Deliver functional changes, verified tests, evidence and an independent critique; superficial rearrangements and fabricated UI are forbidden.

## 3. VERIFIED CURRENT IMPLEMENTATION
Repository paths and symbols to inspect (line numbers refer to the audit baseline, verify again):
- src/studio/calendar.ts
- src/studio/publication.ts
- src/studio/release-readiness.ts
- src/studio/publishers.ts
- src/studio/routes-editorial.ts:600-955
- src/infrastructure/workers/worker-publishing.ts
- apps/studio-web/src/app/pages/calendar-page.component.ts
- apps/studio-web/src/app/pages/publications-page.component.ts
- apps/studio-web/src/app/pages/publishing-page.component.ts
- apps/studio-web/src/app/pages/content-workspace-page.component.ts
- prisma/schema.prisma:1751
Relevant verified observations from the audit:
- src/studio/calendar.ts already projects PlanItem before publication and Publication after; output includes kind=plan_item|publication.
- API supports /v2/publications/:id schedule/reschedule/publish-now/cancel/retry/unpublish; release-readiness checks mode, QA, credentials and workers.
- Publishing and Publications routes both show subsets of publication queue/history; canonical ownership must be explicit.
These are CODE/HISTORICAL-EVIDENCE findings, not necessarily observations of the user's current browser or DB. Read audit docs for exact provenance. Compare Git history and migrations before editing.

## 4. PROBLEMS TO RESOLVE
- Two user calendars can look alike without indicating tentative vs executable items.
- Potential inconsistent timezones, direct drag interactions and schedule changes require end-to-end proof.
- Retries or queue stalls may hide behind generic states; published URL may be missing or stale.
- Multiple screens expose overlapping status actions without consistent authority.
Classify each as CONFIRMED CODE, HISTORICAL TEST or CURRENT RUNTIME HYPOTHESIS. Capture root cause and impact before writing fixes. Do not declare a user-specific runtime problem resolved on a theoretical code change alone.

## 5. TECHNICAL IMPLEMENTATION PLAN
1. Keep Publication as canonical scheduled delivery record; define typed calendar projection with proposed plan item vs confirmed publication and stable IDs.
2. Trace each scheduling action in Content and Calendar to the same publication service, transactional update and scheduler wake-up path. One route contract per action.
3. Handle Europe/Madrid DST, per-site timezone, missed slots, collisions and invalid past times deterministically; display local wall clock and UTC persisted time.
4. Keep idempotency by publication/channel/externalID, verify remote URL and external record after success, ensure retry cannot double-publish.
5. Show review and readiness blockers from STUDIO-02/03 before publish-now or schedule. Human manual release is explicit and audited.
6. Consolidate Publishing's queue/published/destinations read models with Publications; preserve URL redirects/actions while moving canonical controls to one screen.
7. Expose cancellation, retry, stuck jobs and error class; bounded recovery with notifications and operations trail.
Implementation discipline: derive precise API and state contracts from the existing models; protect tenant/site ownership; use additive migrations only if necessary with backfill and rollback. Add structured logs and human-actionable failure codes. Protect performance by avoiding duplicate reloads and N+1 calls. Use bounded retry/idempotency for side-effecting operations. Before removing any obsolete UI, trace its route, handlers, permissions and data usage.

## 6. UX/UI REQUIREMENTS
Calendar distinguishes proposed (outline) vs scheduled (solid) visually and in aria-label; article drawer explains source/QA/readiness. Publications owns execution history/retry/remote URL. Overview summarizes only.
Use actual ui-ux-pro-max and unslop processes when available, follow current brand and design tokens, reuse shared components. Define primary CTA, secondary actions, loading/empty/error/success/partial states, keyboard/focus/ARIA, mobile layout and progressive disclosure. Show current vs changed screenshots before claiming UX PASS.

## 7. SEO REQUIREMENTS
Publish only canonical legible article URLs, verify HTTP/SEO fields on read-only contract endpoint; no technical IDs in public route.
Never manufacture volume, KD, rankings, GSC metrics or confirmed indexation. Label estimates and evidence dates. Respect existing public readable-semantic URL standards.

## 8. CROSS-SYSTEM INTEGRATIONS
Content -> Publication -> Calendar -> worker -> publisher -> external URL -> activity. Connector readiness, AutomationPolicy and provenance must remain coherent.
Confirm effect on GuíaTV and other arbitrary website destinations, historical automation modes, Sources, Editorial Plan, Content, Calendar, background jobs and role permissions. Preserve contract compatibility and explicit user action boundaries.

## 9. DATA INTEGRITY AND SECURITY
No duplicate Publication row, no breaking scheduledFor, no lost externalId, stable record on reschedule, reversible cancellation, no destructive migrations.
No secrets in logs/commits/prompts/screenshots. Ensure RBAC and server-side tenant filtering, SSRF-safe web access, safe HTML, provider rate limits, rollback and historical IDs preservation.

## 10. TEST PLAN
- tests/publishers.test.ts, tests/publisher-fidelity.test.ts, tests/worker-publishing.test.ts
- Browser content schedule -> calendar change -> publications status and error retry on mocked destination
- DST transition, stale job, transient failure, recover idempotently, tenant isolation, wrong mode and invalid credentials
Repository commands: npm run typecheck; npm run build:studio; npm test (WARNING: invokes Prisma migrate deploy, run ONLY on an isolated test DB); npm run test:e2e. Use narrower targeted commands when appropriate; inspect package.json and actual Jest/Jasmine/Node/Playwright configuration. Never claim a test passed without running it.

## 11. OBJECTIVE ACCEPTANCE CRITERIA
- Scheduling from Content and Calendar yields identical canonical Publication state.
- Proposed PlanItem never silently becomes executable before QA/mode policy allow it.
- Retry with same idempotency key does not create duplicate remote draft or article.
- Remote URL/ID verified or marked unverified; errors and pending jobs visible in normal UX.
Attach exact endpoints, persisted entity transitions, sanitized response fragments, Playwright traces and reproducible steps. PASS only on verified behavior; remaining unavailable tools must be BLOCKED with explanation.

## 12. NON-REGRESSION GUARANTEES
Keep social channel variants, scheduler locking, existing publication attempts and dry-run behavior; no live publish permitted in this milestone.
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
Prior dependencies: STUDIO-02, STUDIO-03, STUDIO-07. Read prior milestone's evidence, contract docs and migration notes; verify its actual verdict rather than trusting a headline. Expected handoff to the next milestone: Stable publication telemetry and calendar for STUDIO-10/11.
At end produce Spanish report: current status, root causes, code changes, tests run, evidence URLs/paths, independent review, remaining risks, exact next prompt and dimension-level verdicts.
