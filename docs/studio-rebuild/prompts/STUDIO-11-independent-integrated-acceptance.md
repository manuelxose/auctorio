# AUTORIO STUDIO IMPLEMENTATION MILESTONE
You are a Principal SaaS Product Architect, Staff Full-Stack Engineer, Publishing Systems Engineer, Technical SEO Specialist, Senior UX/UI Designer and Multi-Agent Program Director. Treat the actual repository as the source of truth; this prompt is grounded in GitHub main commit 173ecf037a358fc0360d718f1e8393d846ec3cd1 inspected 2026-11-13, but you MUST revalidate current HEAD and user worktrees. This prompt is independently executable in a fresh Claude Code conversation; do not invent facts or passing tests.

Auctorio is an Angular 20 SSR + Fastify/Prisma/PostgreSQL + Redis/BullMQ AI-assisted editorial SaaS. Existing canonical entities include Site, ConnectorInstallation, PublishingAccount, AutomationPolicy, EditorialPlan/Item, ProductionJob, ContentProject/Version, Publication and Operation. Read docs/studio-rebuild/INDEX.md, 01-REPOSITORY-ARCHITECTURE.md, 07-END-TO-END-PUBLISHING-WORKFLOW.md and 12-ACCEPTANCE-AND-REGRESSION-MATRIX.md if present. Reuse services, do not rebuild indiscriminately.

Tooling contract: inspect available skills first; actually read/use ui-ux-pro-max and unslop if installed. Work with real parallel delegated specialists/worktrees when available; never pretend to have multiple agents. Inspect the local Studio with Playwright and capture screenshots; if unavailable mark UI checks BLOCKED. REA refers only to a local reconstructed-product reference folder, not a skill to install. Preserve uncommitted and unrelated changes; coordinate shared files. No production deploy, content publication, credential rotation, DB reset, destructive migration or unrelated merge. Request explicit permission for those actions. Technical implementation work in English; user-facing report in Spanish.
## 1. MILESTONE IDENTITY
- ID: STUDIO-11
- Title: Independently verify the entire SaaS journey with GuíaTV in safe mode
- Priority: P0
- Functional area: E2E, security, product readiness
- Dependencies: STUDIO-02 through STUDIO-10
- Expected final state: Independent reviewer verifies a complete source -> intelligence -> plan -> content -> schedule -> mocked destination publication journey and reports separate production readiness.

## 2. MISSION
Independent reviewer verifies a complete source -> intelligence -> plan -> content -> schedule -> mocked destination publication journey and reports separate production readiness. Deliver functional changes, verified tests, evidence and an independent critique; superficial rearrangements and fabricated UI are forbidden.

## 3. VERIFIED CURRENT IMPLEMENTATION
Repository paths and symbols to inspect (line numbers refer to the audit baseline, verify again):
- e2e/specs/guiatv-seo-golden-path.spec.ts
- e2e/specs/studio-workflow.spec.ts
- e2e/specs/production-journey.spec.ts
- e2e/specs/autopilot-golden-path.spec.ts
- docs/acceptance/guiatv-local-2026-11-12.md
- scripts/live-guiatv-contract.ts
- docs/studio-rebuild/12-ACCEPTANCE-AND-REGRESSION-MATRIX.md
- package.json
- prisma/schema.prisma
Relevant verified observations from the audit:
- An older local GuíaTV acceptance run completed onboarding and writing but production destination draft was blocked for missing credentials.
- Existing Playwright E2E files cover the workflow and publishing; no verified current run in this audit.
- Provider and worker readiness need real testing; production publishing requires separate authorization.
These are CODE/HISTORICAL-EVIDENCE findings, not necessarily observations of the user's current browser or DB. Read audit docs for exact provenance. Compare Git history and migrations before editing.

## 4. PROBLEMS TO RESOLVE
- Disconnected screen tests alone cannot validate the full SaaS; integration bugs can survive individual PASS states.
- No safe way to claim actual GuíaTV publish without authenticated credentials, nonproduction target or explicit approval.
- UX, accessibility, security, integration and regression outcomes must be separated.
Classify each as CONFIRMED CODE, HISTORICAL TEST or CURRENT RUNTIME HYPOTHESIS. Capture root cause and impact before writing fixes. Do not declare a user-specific runtime problem resolved on a theoretical code change alone.

## 5. TECHNICAL IMPLEMENTATION PLAN
1. Appoint a genuine independent reviewer (not same implementation agent), plus functional QA, security/RBAC, SEO editorial, UX/a11y and backend specialist if actual delegation available.
2. Check main branch/worktree alignment, dependency merges, migrations, QA and reversible rollout plan. Preserve user's unrelated local changes.
3. Run all relevant backend/frontend unit/integration tests, then Playwright at desktop/tablet/mobile and screenshot diffs in a disposable environment.
4. Exercise GuíaTV test site: connect using safe synthetic credentials or read-only probe, crawl representative URLs, approve source strategy, generate 7x1/7x2/7x3 plans, edit brief, generate article + image, review QA and schedule it.
5. Use mocked or isolated destination to test draft sync/publish/unpublish, remote URL, retries, idempotency and webhook, no write to live guiaprogramaciontv.com without explicit authorization.
6. Test mode matrix Manual/Assisted/Autopilot under good/bad credentials, failed worker, dry-run, QA failure, schedule conflict, site switch and multiple tenants.
7. Produce side-by-side current vs target UX, role matrix and SEO evidence integrity audit. Challenge unsupported claims, including false Completed/Ready statuses.
8. Document residual P0/P1/P2, exact run commands, sanitized logs, screenshots, commit refs, rollback, follow-up fixes. Remediate safe blockers and rerun independent review, never greenwash failures.
Implementation discipline: derive precise API and state contracts from the existing models; protect tenant/site ownership; use additive migrations only if necessary with backfill and rollback. Add structured logs and human-actionable failure codes. Protect performance by avoiding duplicate reloads and N+1 calls. Use bounded retry/idempotency for side-effecting operations. Before removing any obsolete UI, trace its route, handlers, permissions and data usage.

## 6. UX/UI REQUIREMENTS
Complete navigation journeys in three widths including keyboard and contextual Copilot, empty/loading/errors, permission differences and nontechnical readability.
Use actual ui-ux-pro-max and unslop processes when available, follow current brand and design tokens, reuse shared components. Define primary CTA, secondary actions, loading/empty/error/success/partial states, keyboard/focus/ARIA, mobile layout and progressive disclosure. Show current vs changed screenshots before claiming UX PASS.

## 7. SEO REQUIREMENTS
Use real URL evidence, no fake Google indexation/keyword volumes; ensure Spanish headings, correct slug/canonical and site topical relevance.
Never manufacture volume, KD, rankings, GSC metrics or confirmed indexation. Label estimates and evidence dates. Respect existing public readable-semantic URL standards.

## 8. CROSS-SYSTEM INTEGRATIONS
Exercise all subsystem contracts Site->Source->PlanItem->ProductionJob->Version->Publication->Operation and Site/Installation/Account readiness.
Confirm effect on GuíaTV and other arbitrary website destinations, historical automation modes, Sources, Editorial Plan, Content, Calendar, background jobs and role permissions. Preserve contract compatibility and explicit user action boundaries.

## 9. DATA INTEGRITY AND SECURITY
Production isolated; no destructive migration or credential exposure; verify idempotency under retries and tenant boundaries. Backups/rollback plan before any real deploy.
No secrets in logs/commits/prompts/screenshots. Ensure RBAC and server-side tenant filtering, SSRF-safe web access, safe HTML, provider rate limits, rollback and historical IDs preservation.

## 10. TEST PLAN
- npm run typecheck; npm run build:studio; npm test only against temporary migrated DB
- npm run test:e2e with explicitly configured base URL and seeded test credentials
- Mocked publisher integration; independent source/code review, a11y and security cases
Repository commands: npm run typecheck; npm run build:studio; npm test (WARNING: invokes Prisma migrate deploy, run ONLY on an isolated test DB); npm run test:e2e. Use narrower targeted commands when appropriate; inspect package.json and actual Jest/Jasmine/Node/Playwright configuration. Never claim a test passed without running it.

## 11. OBJECTIVE ACCEPTANCE CRITERIA
- An independently witnessed complete golden path has screenshots, sanitized traces, persisted IDs and outcome per stage.
- Manual and Assisted never auto-publish; Autopilot only executes if all readiness and QA gates pass.
- 0 cross-tenant leakage, 0 duplicate remote publication on retry, and honest SEO/readiness signals.
- Separate PASS/PARTIAL/BLOCKED/FAIL verdicts for all eight dimensions, and explicit permission before any live publication or deploy.
Attach exact endpoints, persisted entity transitions, sanitized response fragments, Playwright traces and reproducible steps. PASS only on verified behavior; remaining unavailable tools must be BLOCKED with explanation.

## 12. NON-REGRESSION GUARANTEES
All non-regression matrix entries remain valid. Never merge or deploy on a partial global verdict disguised as PASS.
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
Prior dependencies: STUDIO-02 through STUDIO-10. Read prior milestone's evidence, contract docs and migration notes; verify its actual verdict rather than trusting a headline. Expected handoff to the next milestone: Deliver final Spanish executive readiness report, issues and approved deployment decision only after independent evidence.
At end produce Spanish report: current status, root causes, code changes, tests run, evidence URLs/paths, independent review, remaining risks, exact next prompt and dimension-level verdicts.
