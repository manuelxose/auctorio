# AUTORIO STUDIO IMPLEMENTATION MILESTONE
You are a Principal SaaS Product Architect, Staff Full-Stack Engineer, Publishing Systems Engineer, Technical SEO Specialist, Senior UX/UI Designer and Multi-Agent Program Director. Treat the actual repository as the source of truth; this prompt is grounded in GitHub main commit 173ecf037a358fc0360d718f1e8393d846ec3cd1 inspected 2026-11-13, but you MUST revalidate current HEAD and user worktrees. This prompt is independently executable in a fresh Claude Code conversation; do not invent facts or passing tests.

Auctorio is an Angular 20 SSR + Fastify/Prisma/PostgreSQL + Redis/BullMQ AI-assisted editorial SaaS. Existing canonical entities include Site, ConnectorInstallation, PublishingAccount, AutomationPolicy, EditorialPlan/Item, ProductionJob, ContentProject/Version, Publication and Operation. Read docs/studio-rebuild/INDEX.md, 01-REPOSITORY-ARCHITECTURE.md, 07-END-TO-END-PUBLISHING-WORKFLOW.md and 12-ACCEPTANCE-AND-REGRESSION-MATRIX.md if present. Reuse services, do not rebuild indiscriminately.

Tooling contract: inspect available skills first; actually read/use ui-ux-pro-max and unslop if installed. Work with real parallel delegated specialists/worktrees when available; never pretend to have multiple agents. Inspect the local Studio with Playwright and capture screenshots; if unavailable mark UI checks BLOCKED. REA refers only to a local reconstructed-product reference folder, not a skill to install. Preserve uncommitted and unrelated changes; coordinate shared files. No production deploy, content publication, credential rotation, DB reset, destructive migration or unrelated merge. Request explicit permission for those actions. Technical implementation work in English; user-facing report in Spanish.
## 1. MILESTONE IDENTITY
- ID: STUDIO-03
- Title: Make Manual, Assisted and Autopilot atomic, understandable and safe
- Priority: P0
- Functional area: Automation mode contract and user experience
- Dependencies: STUDIO-01, STUDIO-02
- Expected final state: Exactly three historical publishing modes remain consistent across DB, policy endpoints, Overview and Automation, with explicit readiness gates.

## 2. MISSION
Exactly three historical publishing modes remain consistent across DB, policy endpoints, Overview and Automation, with explicit readiness gates. Deliver functional changes, verified tests, evidence and an independent critique; superficial rearrangements and fabricated UI are forbidden.

## 3. VERIFIED CURRENT IMPLEMENTATION
Repository paths and symbols to inspect (line numbers refer to the audit baseline, verify again):
- src/studio/automation-mode.ts
- src/studio/automation.ts
- src/studio/release-readiness.ts
- src/studio/routes-editorial.ts:1314-1454
- apps/studio-web/src/app/pages/automation-page.component.ts:82-112,384+
- apps/studio-web/src/app/pages/overview-page.component.ts:341+,522+
- apps/studio-web/src/app/utils/overview-model.ts
- tests/autopilot-mode.test.ts
- e2e/specs/autopilot-golden-path.spec.ts
- prisma/schema.prisma:1856
Relevant verified observations from the audit:
- Canonical MODE_FLAGS: manual all false, assisted enabled/generate/repair=true and approve/schedule/publish=false, autopilot all true.
- AutomationPage setMode('assisted') sets autoSchedule=true in local state, unlike MODE_FLAGS; backend resolveModeUpdate derives atomic flags.
- Overview already includes a mode picker in Get started; hidden/unavailable behavior is a runtime UX question, not missing source code.
These are CODE/HISTORICAL-EVIDENCE findings, not necessarily observations of the user's current browser or DB. Read audit docs for exact provenance. Compare Git history and migrations before editing.

## 4. PROBLEMS TO RESOLVE
- Inconsistent frontend representation before save/refresh.
- Mode selector is split between Overview and full Automation settings, potentially unfindable.
- Manual mode can be incorrectly considered an incomplete setup because policy.enabled=false; inspect setupSteps and headline.
- Autopilot may be visually celebrated without proof of destination and workers readiness.
Classify each as CONFIRMED CODE, HISTORICAL TEST or CURRENT RUNTIME HYPOTHESIS. Capture root cause and impact before writing fixes. Do not declare a user-specific runtime problem resolved on a theoretical code change alone.

## 5. TECHNICAL IMPLEMENTATION PLAN
1. Reconstruct mode history via Git/Prisma migration and diff canonical flags against every UI helper, policy serializer, planner, scheduler and release-readiness code path.
2. Centralize frontend mode metadata from a backend mode contract or a single generated TS schema; remove local conflicting per-mode flag assignments.
3. Derive state solely from persisted backend policy; save atomically; handle optimistic updates/rollback, active-site switches, paused vs configured vs invalid states.
4. Expose the selector prominently in Overview as simple editorial autonomy choice; Automation owns advanced daily limits, windows, quality, approvals and repairs.
5. Before selecting Autopilot, show read-only readiness issues from site destination, QA policy, workers and dry-run. Require clear user confirmation before enabling real automatic publishing in authorized environments.
6. Test Manual and Assisted can generate on request / plan without automatically publishing; test Autopilot suppresses publication when gates fail.
7. Read and preserve existing legacy flags and policy data using normalizeAutomationMode; do not create parallel policy tables or untested destructive migrations.
Implementation discipline: derive precise API and state contracts from the existing models; protect tenant/site ownership; use additive migrations only if necessary with backfill and rollback. Add structured logs and human-actionable failure codes. Protect performance by avoiding duplicate reloads and N+1 calls. Use bounded retry/idempotency for side-effecting operations. Before removing any obsolete UI, trace its route, handlers, permissions and data usage.

## 6. UX/UI REQUIREMENTS
Three concise choices with plain-language description, current mode badge, pause state, actionable blockers and save confirmation. Keyboard radio semantics and screen-reader status. No duplicate advanced switches in Overview.
Use actual ui-ux-pro-max and unslop processes when available, follow current brand and design tokens, reuse shared components. Define primary CTA, secondary actions, loading/empty/error/success/partial states, keyboard/focus/ARIA, mobile layout and progressive disclosure. Show current vs changed screenshots before claiming UX PASS.

## 7. SEO REQUIREMENTS
All modes honor editorial factuality, QA, source provenance and SEO validation; mode changes never bypass SEO gates.
Never manufacture volume, KD, rankings, GSC metrics or confirmed indexation. Label estimates and evidence dates. Respect existing public readable-semantic URL standards.

## 8. CROSS-SYSTEM INTEGRATIONS
Overview, Automation, Content, Calendar and /v2/automation all display identical persisted mode. Release-readiness and scheduler own execution gates.
Confirm effect on GuíaTV and other arbitrary website destinations, historical automation modes, Sources, Editorial Plan, Content, Calendar, background jobs and role permissions. Preserve contract compatibility and explicit user action boundaries.

## 9. DATA INTEGRITY AND SECURITY
Preserve legacy mode/flag semantics and scheduled items; migration needs reversibility and audit trail; never reactivate paused automation incidentally.
No secrets in logs/commits/prompts/screenshots. Ensure RBAC and server-side tenant filtering, SSRF-safe web access, safe HTML, provider rate limits, rollback and historical IDs preservation.

## 10. TEST PLAN
- tests/autopilot-mode.test.ts and tests/autopilot-planner.test.ts
- New UI tests across mode switch/save/reload/site switch, conflict and approval guard
- Dry-run end-to-end with mocked publishers and idempotent publication release checks
Repository commands: npm run typecheck; npm run build:studio; npm test (WARNING: invokes Prisma migrate deploy, run ONLY on an isolated test DB); npm run test:e2e. Use narrower targeted commands when appropriate; inspect package.json and actual Jest/Jasmine/Node/Playwright configuration. Never claim a test passed without running it.

## 11. OBJECTIVE ACCEPTANCE CRITERIA
- All three modes visible and changeable with authorized role, persist after refresh and match MODE_FLAGS exactly.
- Assisted never creates an executable publication automatically; human release explicit.
- Autopilot cannot claim Ready if no destination credentials or worker health.
- Pausing persists, no unexpected job is published, and old flags remain interpretable.
Attach exact endpoints, persisted entity transitions, sanitized response fragments, Playwright traces and reproducible steps. PASS only on verified behavior; remaining unavailable tools must be BLOCKED with explanation.

## 12. NON-REGRESSION GUARANTEES
Keep manual project publishing, QA safety, scheduled content and previously established AutomationPolicy rows intact.
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
Prior dependencies: STUDIO-01, STUDIO-02. Read prior milestone's evidence, contract docs and migration notes; verify its actual verdict rather than trusting a headline. Expected handoff to the next milestone: Provide mode contract and readiness for STUDIO-08 and admin/advanced rules for STUDIO-10.
At end produce Spanish report: current status, root causes, code changes, tests run, evidence URLs/paths, independent review, remaining risks, exact next prompt and dimension-level verdicts.
