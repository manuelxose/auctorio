# AUTORIO STUDIO IMPLEMENTATION MILESTONE
You are a Principal SaaS Product Architect, Staff Full-Stack Engineer, Publishing Systems Engineer, Technical SEO Specialist, Senior UX/UI Designer and Multi-Agent Program Director. Treat the actual repository as the source of truth; this prompt is grounded in GitHub main commit 173ecf037a358fc0360d718f1e8393d846ec3cd1 inspected 2026-11-13, but you MUST revalidate current HEAD and user worktrees. This prompt is independently executable in a fresh Claude Code conversation; do not invent facts or passing tests.

Auctorio is an Angular 20 SSR + Fastify/Prisma/PostgreSQL + Redis/BullMQ AI-assisted editorial SaaS. Existing canonical entities include Site, ConnectorInstallation, PublishingAccount, AutomationPolicy, EditorialPlan/Item, ProductionJob, ContentProject/Version, Publication and Operation. Read docs/studio-rebuild/INDEX.md, 01-REPOSITORY-ARCHITECTURE.md, 07-END-TO-END-PUBLISHING-WORKFLOW.md and 12-ACCEPTANCE-AND-REGRESSION-MATRIX.md if present. Reuse services, do not rebuild indiscriminately.

Tooling contract: inspect available skills first; actually read/use ui-ux-pro-max and unslop if installed. Work with real parallel delegated specialists/worktrees when available; never pretend to have multiple agents. Inspect the local Studio with Playwright and capture screenshots; if unavailable mark UI checks BLOCKED. REA refers only to a local reconstructed-product reference folder, not a skill to install. Preserve uncommitted and unrelated changes; coordinate shared files. No production deploy, content publication, credential rotation, DB reset, destructive migration or unrelated merge. Request explicit permission for those actions. Technical implementation work in English; user-facing report in Spanish.
## 1. MILESTONE IDENTITY
- ID: STUDIO-06
- Title: Complete daily editorial plans and preserve approved brief intent
- Priority: P1
- Functional area: Editorial Plan generation and source-backed planning
- Dependencies: STUDIO-04, STUDIO-05
- Expected final state: For a selected period and daily cadence, every requested slot is either filled with an approved relevant brief or transparently blocked with a precise reason and fix.

## 2. MISSION
For a selected period and daily cadence, every requested slot is either filled with an approved relevant brief or transparently blocked with a precise reason and fix. Deliver functional changes, verified tests, evidence and an independent critique; superficial rearrangements and fabricated UI are forbidden.

## 3. VERIFIED CURRENT IMPLEMENTATION
Repository paths and symbols to inspect (line numbers refer to the audit baseline, verify again):
- apps/studio-web/src/app/pages/editorial-plan-page.component.ts
- apps/studio-web/src/app/components/planning/plan-generator.component.ts
- apps/studio-web/src/app/components/planning/plan-item-drawer.component.ts
- src/studio/editorial-plan.ts
- src/studio/editorial-plan-context.ts
- src/studio/site-relevance.ts:303-311
- src/studio/plan-slots.ts
- src/studio/routes-editorial.ts:1455-1959
- tests/editorial-plan-v2.test.ts
- docs/acceptance/guiatv-local-2026-11-12.md
Relevant verified observations from the audit:
- Local 7x1 plan filled 7/7; 7x2 needed fill to reach 14/14; 7x3 fill reached 20/21, with 'no valid proposal survived' reasons.
- Approved 'Streaming y plataformas' pillar does not match discovered movie/article/sports clusters; relevance calculation skips +15 known-cluster points.
- Plan UI already has backlog/pipeline/calendar visualizations and a PlanItemDrawer; backend has plan presets and site planning settings.
These are CODE/HISTORICAL-EVIDENCE findings, not necessarily observations of the user's current browser or DB. Read audit docs for exact provenance. Compare Git history and migrations before editing.

## 4. PROBLEMS TO RESOLVE
- Approval of valid strategy pillars and relevance guardrails produce conflicting output.
- Daily slot coverage and explicit plan status do not always agree; retry loops can exhaust valid topics.
- Manual edited outline and final suggested title require faithful propagation to production.
- Proposal dates vs publication schedules ambiguous.
Classify each as CONFIRMED CODE, HISTORICAL TEST or CURRENT RUNTIME HYPOTHESIS. Capture root cause and impact before writing fixes. Do not declare a user-specific runtime problem resolved on a theoretical code change alone.

## 5. TECHNICAL IMPLEMENTATION PLAN
1. Validate PlanItem fields and plan generator API payload against site timezone/presets and actual planned cadence; use canonical slot keys date+channel+time.
2. Map approved strategic pillar to detected/mapped topic clusters using a versioned alias/canonical ontology; never artificially award relevance to unrelated articles.
3. Correct topic relevance filtering and de-duplication across batches, nearby article URLs, recent plans and content; expose rejection categories with evidence.
4. Use bounded retries with explicit per-slot outcomes and checkpointing; support fill missing slots without changing existing approved plan items or duplicating content.
5. Propagate planItem.finalSuggestedTitle, outline, source evidence, keyword intent and audience into the structured production brief (including Spanish section structure).
6. Keep Editorial Plan Calendar as proposed editorial slots, and real Calendar as authoritative confirmed publication schedule. Clearly label planned vs scheduled.
7. Use one row status transition: proposed->approved->generating->review_required/content_ready; keep compatibility with enum existing values and ProductionJob.
Implementation discipline: derive precise API and state contracts from the existing models; protect tenant/site ownership; use additive migrations only if necessary with backfill and rollback. Add structured logs and human-actionable failure codes. Protect performance by avoiding duplicate reloads and N+1 calls. Use bounded retry/idempotency for side-effecting operations. Before removing any obsolete UI, trace its route, handlers, permissions and data usage.

## 6. UX/UI REQUIREMENTS
Plan generator shows goals, daily count, site strategy, channels, exclusions, existing content and evidence. Backlog exposes missing slots and blockers; drawer supports approve/edit/retry; no duplicate independent calendar scheduler.
Use actual ui-ux-pro-max and unslop processes when available, follow current brand and design tokens, reuse shared components. Define primary CTA, secondary actions, loading/empty/error/success/partial states, keyboard/focus/ARIA, mobile layout and progressive disclosure. Show current vs changed screenshots before claiming UX PASS.

## 7. SEO REQUIREMENTS
Prioritize target intent, source-backed primary keyword, internal links, user intent, topical authority, non-cannibalization and adequate evidence. Never invent KD, search volume or ranking.
Never manufacture volume, KD, rankings, GSC metrics or confirmed indexation. Label estimates and evidence dates. Respect existing public readable-semantic URL standards.

## 8. CROSS-SYSTEM INTEGRATIONS
/v2/editorial-plans/generate and /:id/fill, plan item update/approve/generate-content, production/jobs, strategy and source-evidence.
Confirm effect on GuíaTV and other arbitrary website destinations, historical automation modes, Sources, Editorial Plan, Content, Calendar, background jobs and role permissions. Preserve contract compatibility and explicit user action boundaries.

## 9. DATA INTEGRITY AND SECURITY
Plans and items preserve IDs, edited briefs, schedules, approval history, idempotent generation and tenant/site isolation. No reset of approved plans.
No secrets in logs/commits/prompts/screenshots. Ensure RBAC and server-side tenant filtering, SSRF-safe web access, safe HTML, provider rate limits, rollback and historical IDs preservation.

## 10. TEST PLAN
- tests/editorial-plan-v2.test.ts, tests/plan-slots.test.ts, tests/planning-workspace.test.ts, tests/plan-item-brief-title.test.ts
- 7x1/7x2/7x3 fixtures with approved/excluded pillars, source evidence and overlapping URLs
- Browser generating-progress, fill, edit/approve, stale operation recovery, DST for Europe/Madrid
Repository commands: npm run typecheck; npm run build:studio; npm test (WARNING: invokes Prisma migrate deploy, run ONLY on an isolated test DB); npm run test:e2e. Use narrower targeted commands when appropriate; inspect package.json and actual Jest/Jasmine/Node/Playwright configuration. Never claim a test passed without running it.

## 11. OBJECTIVE ACCEPTANCE CRITERIA
- 7x1/7x2/7x3 produce target counts in deterministic fixture or each missing slot has a non-generic rejection reason and safe retry path.
- An approved pillar name can be scored through explicit mapping, not discarded as unknown.
- Edited final headline/outline remain intact into ProductionJob and ContentVersion.
- Plan Calendar does not create an executable publication merely by displaying a proposal.
Attach exact endpoints, persisted entity transitions, sanitized response fragments, Playwright traces and reproducible steps. PASS only on verified behavior; remaining unavailable tools must be BLOCKED with explanation.

## 12. NON-REGRESSION GUARANTEES
Preserve existing plans and editorial approvals; no unexpected automation start, no copy of Publication schedule into duplicate table.
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
Prior dependencies: STUDIO-04, STUDIO-05. Read prior milestone's evidence, contract docs and migration notes; verify its actual verdict rather than trusting a headline. Expected handoff to the next milestone: Approved grounded briefs and idempotent planItem ID to STUDIO-07.
At end produce Spanish report: current status, root causes, code changes, tests run, evidence URLs/paths, independent review, remaining risks, exact next prompt and dimension-level verdicts.
