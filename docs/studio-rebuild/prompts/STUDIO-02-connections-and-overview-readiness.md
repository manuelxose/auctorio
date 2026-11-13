# AUTORIO STUDIO IMPLEMENTATION MILESTONE
You are a Principal SaaS Product Architect, Staff Full-Stack Engineer, Publishing Systems Engineer, Technical SEO Specialist, Senior UX/UI Designer and Multi-Agent Program Director. Treat the actual repository as the source of truth; this prompt is grounded in GitHub main commit 173ecf037a358fc0360d718f1e8393d846ec3cd1 inspected 2026-11-13, but you MUST revalidate current HEAD and user worktrees. This prompt is independently executable in a fresh Claude Code conversation; do not invent facts or passing tests.

Auctorio is an Angular 20 SSR + Fastify/Prisma/PostgreSQL + Redis/BullMQ AI-assisted editorial SaaS. Existing canonical entities include Site, ConnectorInstallation, PublishingAccount, AutomationPolicy, EditorialPlan/Item, ProductionJob, ContentProject/Version, Publication and Operation. Read docs/studio-rebuild/INDEX.md, 01-REPOSITORY-ARCHITECTURE.md, 07-END-TO-END-PUBLISHING-WORKFLOW.md and 12-ACCEPTANCE-AND-REGRESSION-MATRIX.md if present. Reuse services, do not rebuild indiscriminately.

Tooling contract: inspect available skills first; actually read/use ui-ux-pro-max and unslop if installed. Work with real parallel delegated specialists/worktrees when available; never pretend to have multiple agents. Inspect the local Studio with Playwright and capture screenshots; if unavailable mark UI checks BLOCKED. REA refers only to a local reconstructed-product reference folder, not a skill to install. Preserve uncommitted and unrelated changes; coordinate shared files. No production deploy, content publication, credential rotation, DB reset, destructive migration or unrelated merge. Request explicit permission for those actions. Technical implementation work in English; user-facing report in Spanish.
## 1. MILESTONE IDENTITY
- ID: STUDIO-02
- Title: Unify destination identity and accurately surface GuíaTV in Overview
- Priority: P0
- Functional area: Connections, Overview and integration readiness
- Dependencies: STUDIO-01
- Expected final state: A real website installation, whether legacy or new, appears once in Connections and Overview with a truthful verified status and actionable reason if not ready.

## 2. MISSION
A real website installation, whether legacy or new, appears once in Connections and Overview with a truthful verified status and actionable reason if not ready. Deliver functional changes, verified tests, evidence and an independent critique; superficial rearrangements and fabricated UI are forbidden.

## 3. VERIFIED CURRENT IMPLEMENTATION
Repository paths and symbols to inspect (line numbers refer to the audit baseline, verify again):
- src/studio/routes-editorial.ts:2155-2304
- src/studio/routes-connectors.ts:450-579
- src/studio/connectors/installation.ts
- src/studio/connectors/verification.ts
- src/studio/release-readiness.ts
- apps/studio-web/src/app/pages/overview-page.component.ts
- apps/studio-web/src/app/pages/connections-page.component.ts
- apps/studio-web/src/app/services/studio-api.service.ts
- apps/studio-web/src/app/models/studio.models.ts
- prisma/schema.prisma
Relevant verified observations from the audit:
- GET /v2/overview currently maps only prisma.publishingAccount to connections; website activation records Site and ConnectorInstallation without creating a PublishingAccount in its website branch.
- Overview connectionState returns connected when status is active even if a fresh capability verification has not been confirmed.
- The 12-Nov local GuíaTV test had Site but no publishing credentials and did not attempt the destination draft.
These are CODE/HISTORICAL-EVIDENCE findings, not necessarily observations of the user's current browser or DB. Read audit docs for exact provenance. Compare Git history and migrations before editing.

## 4. PROBLEMS TO RESOLVE
- Newly installed websites may be omitted from the Overview list; actual account-specific cause remains unverified until STUDIO-01.
- Site membership, destination installation and publication permission are separate concepts currently conflated in status labels.
- Readiness and verification health can diverge across screens or workspace scopes.
Classify each as CONFIRMED CODE, HISTORICAL TEST or CURRENT RUNTIME HYPOTHESIS. Capture root cause and impact before writing fixes. Do not declare a user-specific runtime problem resolved on a theoretical code change alone.

## 5. TECHNICAL IMPLEMENTATION PLAN
1. Trace legacy website publishing credential references, active connector installations, installer activation and publisher adapter resolution, including GuiaTvPublisher fallback and existing live contract.
2. Implement a tenant/site-scoped DestinationReadModel or equivalent read-only service that joins Site, ConnectorInstallation, PublishingAccount, probe history and last Publication without leaking secrets.
3. Represent configured, authenticated, reachable, capabilities verified, can_create_draft, can_publish, ready, last_verified and last_successful_publication separately; unknown must never be converted to success.
4. Update /v2/overview response compatibly with typed destination summaries and deprecation-safe legacy connections mapping; do not introduce duplicate destination records.
5. Update Connections and Overview to consume the same statuses, expose last-checked timestamp and the correct verification/repair link.
6. Switch active site and verify the row is scoped correctly; invalidate stale UI data on site change and avoid tenant-wide counts presented as active-site counts.
7. Use a read-only capability probe where possible. Do not create or delete a real remote draft merely to validate a credential without explicit consent.
8. Ensure GuideTV legacy Site can be linked to a modern installation by normalized origin safely without changing type=guiatv or cloning Sites.
Implementation discipline: derive precise API and state contracts from the existing models; protect tenant/site ownership; use additive migrations only if necessary with backfill and rollback. Add structured logs and human-actionable failure codes. Protect performance by avoiding duplicate reloads and N+1 calls. Use bounded retry/idempotency for side-effecting operations. Before removing any obsolete UI, trace its route, handlers, permissions and data usage.

## 6. UX/UI REQUIREMENTS
Overview shows the selected site separately from the destination health; states Unconfigured/Stored/Not verified/Authenticated/Read-only/Ready/Error. Primary CTA resolves the actual blocker and shows verification age. Connections remains canonical configuration surface.
Use actual ui-ux-pro-max and unslop processes when available, follow current brand and design tokens, reuse shared components. Define primary CTA, secondary actions, loading/empty/error/success/partial states, keyboard/focus/ARIA, mobile layout and progressive disclosure. Show current vs changed screenshots before claiming UX PASS.

## 7. SEO REQUIREMENTS
No SEO claim derives from connection status. A readable site URL is contextual information, not a confirmation of crawling or indexation.
Never manufacture volume, KD, rankings, GSC metrics or confirmed indexation. Label estimates and evidence dates. Respect existing public readable-semantic URL standards.

## 8. CROSS-SYSTEM INTEGRATIONS
Protect /v2/overview and installation routes, BFF /studio/api/backend/v2; preserve publish adapters and /v2/sites. Never re-enable Autopilot based only on a stored token.
Confirm effect on GuíaTV and other arbitrary website destinations, historical automation modes, Sources, Editorial Plan, Content, Calendar, background jobs and role permissions. Preserve contract compatibility and explicit user action boundaries.

## 9. DATA INTEGRITY AND SECURITY
Backward compatible additions; tenantId+siteId scope for each join; credential ciphertext never serialized; idempotent installer reconciliation; preserve legacy records, publication history and external IDs.
No secrets in logs/commits/prompts/screenshots. Ensure RBAC and server-side tenant filtering, SSRF-safe web access, safe HTML, provider rate limits, rollback and historical IDs preservation.

## 10. TEST PLAN
- tests/connector-routes.test.ts, tests/connection-discovery.test.ts, tests/site-isolation.test.ts
- New contract cases: Site only, active installation only, legacy account only, both, disabled, revoked, stale, no scopes, wrong tenant
- Playwright Overview/Connections/site-switching, network state and empty/error rendering
Repository commands: npm run typecheck; npm run build:studio; npm test (WARNING: invokes Prisma migrate deploy, run ONLY on an isolated test DB); npm run test:e2e. Use narrower targeted commands when appropriate; inspect package.json and actual Jest/Jasmine/Node/Playwright configuration. Never claim a test passed without running it.

## 11. OBJECTIVE ACCEPTANCE CRITERIA
- A synthetic GuíaTV installation without PublishingAccount appears exactly once with Not verified or other accurate state.
- Incorrect or missing credentials never render Connected/Ready; verified write capability is shown separately.
- Existing website/social accounts still appear; two tenants cannot see one another's destinations.
- No real publication or credential exposure occurs during test.
Attach exact endpoints, persisted entity transitions, sanitized response fragments, Playwright traces and reproducible steps. PASS only on verified behavior; remaining unavailable tools must be BLOCKED with explanation.

## 12. NON-REGRESSION GUARANTEES
Do not alter existing publishing jobs, adapters, site type or contents. Preserve installer resumability and multi-site session behavior.
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
Prior dependencies: STUDIO-01. Read prior milestone's evidence, contract docs and migration notes; verify its actual verdict rather than trusting a headline. Expected handoff to the next milestone: Expose reliable destination readiness to STUDIO-03, STUDIO-08 and STUDIO-09.
At end produce Spanish report: current status, root causes, code changes, tests run, evidence URLs/paths, independent review, remaining risks, exact next prompt and dimension-level verdicts.
