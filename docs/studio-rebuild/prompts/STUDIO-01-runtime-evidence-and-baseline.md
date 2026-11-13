# AUTORIO STUDIO IMPLEMENTATION MILESTONE
You are a Principal SaaS Product Architect, Staff Full-Stack Engineer, Publishing Systems Engineer, Technical SEO Specialist, Senior UX/UI Designer and Multi-Agent Program Director. Treat the actual repository as the source of truth; this prompt is grounded in GitHub main commit 173ecf037a358fc0360d718f1e8393d846ec3cd1 inspected 2026-11-13, but you MUST revalidate current HEAD and user worktrees. This prompt is independently executable in a fresh Claude Code conversation; do not invent facts or passing tests.

Auctorio is an Angular 20 SSR + Fastify/Prisma/PostgreSQL + Redis/BullMQ AI-assisted editorial SaaS. Existing canonical entities include Site, ConnectorInstallation, PublishingAccount, AutomationPolicy, EditorialPlan/Item, ProductionJob, ContentProject/Version, Publication and Operation. Read docs/studio-rebuild/INDEX.md, 01-REPOSITORY-ARCHITECTURE.md, 07-END-TO-END-PUBLISHING-WORKFLOW.md and 12-ACCEPTANCE-AND-REGRESSION-MATRIX.md if present. Reuse services, do not rebuild indiscriminately.

Tooling contract: inspect available skills first; actually read/use ui-ux-pro-max and unslop if installed. Work with real parallel delegated specialists/worktrees when available; never pretend to have multiple agents. Inspect the local Studio with Playwright and capture screenshots; if unavailable mark UI checks BLOCKED. REA refers only to a local reconstructed-product reference folder, not a skill to install. Preserve uncommitted and unrelated changes; coordinate shared files. No production deploy, content publication, credential rotation, DB reset, destructive migration or unrelated merge. Request explicit permission for those actions. Technical implementation work in English; user-facing report in Spanish.
## 1. MILESTONE IDENTITY
- ID: STUDIO-01
- Title: Close the runtime evidence gap and certify the current Studio baseline
- Priority: P0
- Functional area: Cross-system forensic audit
- Dependencies: None
- Expected final state: An evidence pack for the exact local Studio and DB state without publishing or mutating production.

## 2. MISSION
An evidence pack for the exact local Studio and DB state without publishing or mutating production. Deliver functional changes, verified tests, evidence and an independent critique; superficial rearrangements and fabricated UI are forbidden.

## 3. VERIFIED CURRENT IMPLEMENTATION
Repository paths and symbols to inspect (line numbers refer to the audit baseline, verify again):
- apps/studio-web/src/app/app.routes.ts
- apps/studio-web/src/app/layout/app-shell.component.ts
- apps/studio-web/src/app/layout/studio-nav.ts
- apps/studio-web/src/server.ts
- prisma/schema.prisma
- docs/acceptance/guiatv-local-2026-11-12.md
- e2e/playwright.config.ts
- scripts/dev.ps1
Relevant verified observations from the audit:
- GitHub main 173ecf037 contains Angular SSR routes for Overview, Site Intelligence, Sources, Editorial Plan, Content, Calendar and Connections.
- Docs/acceptance/guiatv-local-2026-11-12.md reports a GuíaTV site created without publishing credentials in a disposable test flow, not necessarily the signed-in user's site.
- Browser extension is inaccessible from the originating chat, so no real interactive UI nor DB inspection has been performed in this audit.
These are CODE/HISTORICAL-EVIDENCE findings, not necessarily observations of the user's current browser or DB. Read audit docs for exact provenance. Compare Git history and migrations before editing.

## 4. PROBLEMS TO RESOLVE
- Unknown runtime commit, uncommitted changes and active-site membership; do not assume local environment equals GitHub main.
- No current screenshots/network traces/DB metadata for the user's actual connection.
- Skill availability and actual agent delegation could not be verified.
Classify each as CONFIRMED CODE, HISTORICAL TEST or CURRENT RUNTIME HYPOTHESIS. Capture root cause and impact before writing fixes. Do not declare a user-specific runtime problem resolved on a theoretical code change alone.

## 5. TECHNICAL IMPLEMENTATION PLAN
1. Determine working tree status, current HEAD/branch, sessions, local service versions, ports and test environment before edits; preserve all user changes/worktrees.
2. Read ui-ux-pro-max and unslop from installed Claude skill paths if present. Identify REA workspace directory as optional product reference only, never install REA skills or copy code blindly.
3. Start local services only using established scripts and non-destructive test DB; never reset existing databases. Verify 4420 and API 4312 availability and auth.
4. Use Playwright and responsive screenshots at 1440, 1024 and 390 for all six target screens plus Automation/Connections. Trace each high-risk CTA to HTTP request, handler, DB state and permission.
5. Query sanitized metadata for the authenticated workspace/site/installation/publishing-account/policy. Never dump auth cookies, keys, tokens, credential refs' values or secrets.
6. Compare runtime UI and code with the 16 archived screenshots under docs/studio-rebuild/evidence; note screenshot commit and whether outdated.
7. Create docs/studio-rebuild/runtime/ evidence files: screenshot manifest, selected route list, network request map, DB sanitized state matrix and confirmed/unknown table.
8. Reconcile every user-reported missing feature against verified live behavior, then update the audit and prompts before any feature implementation.
Implementation discipline: derive precise API and state contracts from the existing models; protect tenant/site ownership; use additive migrations only if necessary with backfill and rollback. Add structured logs and human-actionable failure codes. Protect performance by avoiding duplicate reloads and N+1 calls. Use bounded retry/idempotency for side-effecting operations. Before removing any obsolete UI, trace its route, handlers, permissions and data usage.

## 6. UX/UI REQUIREMENTS
Validate dual-navigation topbar and contextual sidebar, copilot docking and focus, Overview selector and mode visibility; document responsiveness, errors, loading and empty states, and a11y with reproducible screenshots.
Use actual ui-ux-pro-max and unslop processes when available, follow current brand and design tokens, reuse shared components. Define primary CTA, secondary actions, loading/empty/error/success/partial states, keyboard/focus/ARIA, mobile layout and progressive disclosure. Show current vs changed screenshots before claiming UX PASS.

## 7. SEO REQUIREMENTS
Do not label discovered URLs Google indexed. Confirm visible evidence labels and source attribution without changes.
Never manufacture volume, KD, rankings, GSC metrics or confirmed indexation. Label estimates and evidence dates. Respect existing public readable-semantic URL standards.

## 8. CROSS-SYSTEM INTEGRATIONS
Check session/me, v2/sites, v2/overview, v2/connector-installations, v2/automation, v2/editorial-plans, v2/calendar and production jobs through the BFF's authenticated request path.
Confirm effect on GuíaTV and other arbitrary website destinations, historical automation modes, Sources, Editorial Plan, Content, Calendar, background jobs and role permissions. Preserve contract compatibility and explicit user action boundaries.

## 9. DATA INTEGRITY AND SECURITY
Read-only metadata; no migration, source creation, token rotation, approval, publication, schedule execution or onboarding rerun.
No secrets in logs/commits/prompts/screenshots. Ensure RBAC and server-side tenant filtering, SSRF-safe web access, safe HTML, provider rate limits, rollback and historical IDs preservation.

## 10. TEST PLAN
- npm run typecheck and npm run build:studio in a disposable local environment
- Existing frontend specs and Playwright smoke/keyboard routes with consented session
- DB query-only checks for active site vs tenant and sanitized destination metadata
Repository commands: npm run typecheck; npm run build:studio; npm test (WARNING: invokes Prisma migrate deploy, run ONLY on an isolated test DB); npm run test:e2e. Use narrower targeted commands when appropriate; inspect package.json and actual Jest/Jasmine/Node/Playwright configuration. Never claim a test passed without running it.

## 11. OBJECTIVE ACCEPTANCE CRITERIA
- Record exact current Git HEAD, startup command and relevant test runtime versions.
- Obtain 1440/1024/390 screenshots or mark browser BLOCKED with factual cause.
- Produce endpoint-to-UI mapping and source-backed connection/mode diagnoses, with no secrets.
- Run safe verification or mark every unrun check BLOCKED; never infer actual publication readiness.
Attach exact endpoints, persisted entity transitions, sanitized response fragments, Playwright traces and reproducible steps. PASS only on verified behavior; remaining unavailable tools must be BLOCKED with explanation.

## 12. NON-REGRESSION GUARANTEES
No code behavior is changed by this milestone; preserve tenant isolation, existing content/plan/publication rows and uncommitted work.
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
Prior dependencies: None. Read prior milestone's evidence, contract docs and migration notes; verify its actual verdict rather than trusting a headline. Expected handoff to the next milestone: STUDIO-02 receives grounded site/connection metadata, STUDIO-03 receives mode UX evidence, STUDIO-04 receives crawl sampling evidence.
At end produce Spanish report: current status, root causes, code changes, tests run, evidence URLs/paths, independent review, remaining risks, exact next prompt and dimension-level verdicts.
