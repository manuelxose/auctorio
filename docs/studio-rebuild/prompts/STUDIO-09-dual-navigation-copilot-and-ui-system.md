# AUTORIO STUDIO IMPLEMENTATION MILESTONE
You are a Principal SaaS Product Architect, Staff Full-Stack Engineer, Publishing Systems Engineer, Technical SEO Specialist, Senior UX/UI Designer and Multi-Agent Program Director. Treat the actual repository as the source of truth; this prompt is grounded in GitHub main commit 173ecf037a358fc0360d718f1e8393d846ec3cd1 inspected 2026-11-13, but you MUST revalidate current HEAD and user worktrees. This prompt is independently executable in a fresh Claude Code conversation; do not invent facts or passing tests.

Auctorio is an Angular 20 SSR + Fastify/Prisma/PostgreSQL + Redis/BullMQ AI-assisted editorial SaaS. Existing canonical entities include Site, ConnectorInstallation, PublishingAccount, AutomationPolicy, EditorialPlan/Item, ProductionJob, ContentProject/Version, Publication and Operation. Read docs/studio-rebuild/INDEX.md, 01-REPOSITORY-ARCHITECTURE.md, 07-END-TO-END-PUBLISHING-WORKFLOW.md and 12-ACCEPTANCE-AND-REGRESSION-MATRIX.md if present. Reuse services, do not rebuild indiscriminately.

Tooling contract: inspect available skills first; actually read/use ui-ux-pro-max and unslop if installed. Work with real parallel delegated specialists/worktrees when available; never pretend to have multiple agents. Inspect the local Studio with Playwright and capture screenshots; if unavailable mark UI checks BLOCKED. REA refers only to a local reconstructed-product reference folder, not a skill to install. Preserve uncommitted and unrelated changes; coordinate shared files. No production deploy, content publication, credential rotation, DB reset, destructive migration or unrelated merge. Request explicit permission for those actions. Technical implementation work in English; user-facing report in Spanish.
Test destination contract (authoritative, overrides any other site/account mentioned below): ALL runtime, Playwright, e2e and live checks use the site guiaprogramaciontv.com (local Site key `guiatv-editorial`, name GuiaProgramacionTV, baseUrl https://guiaprogramaciontv.com). Its connector token is the env var GUIATV_AUCTORIO_ADMIN_KEY, already present in the gitignored .env and verified valid on 2026-11-13: REUSE it, NEVER create, rotate or request a new token, and never print it in logs, commits, screenshots or reports. Live writes against the destination are limited to the draft create/delete key check; never leave content published (the stock npm run test:live:guiatv publishes briefly and expects 403 where the site returns 401, so prefer the draft-only check). Other tenants/sites are out of scope unless a prompt says otherwise.

## 1. MILESTONE IDENTITY
- ID: STUDIO-09
- Title: Deliver the two-level Studio navigation and cohesive contextual AI assistant
- Priority: P1
- Functional area: Studio shell and cross-screen UX/UI
- Dependencies: STUDIO-01, STUDIO-02
- Expected final state: A coherent global header and contextual left sidebar with a usable persistent Copilot that preserve feature discoverability and work on desktop/mobile.

## 2. MISSION
A coherent global header and contextual left sidebar with a usable persistent Copilot that preserve feature discoverability and work on desktop/mobile. Deliver functional changes, verified tests, evidence and an independent critique; superficial rearrangements and fabricated UI are forbidden.

## 3. VERIFIED CURRENT IMPLEMENTATION
Repository paths and symbols to inspect (line numbers refer to the audit baseline, verify again):
- apps/studio-web/src/app/layout/app-shell.component.ts
- apps/studio-web/src/app/layout/studio-nav.ts
- apps/studio-web/src/app/layout/command-palette.component.ts
- apps/studio-web/src/app/components/copilot/copilot-panel.component.ts
- apps/studio-web/src/app/services/copilot.service.ts
- apps/studio-web/src/app/services/app-context.service.ts
- apps/studio-web/src/app/app.routes.ts
- apps/studio-web/src/styles.css
- docs/studio-rebuild/NAVIGATION.md
- docs/studio-rebuild/DESIGN-SYSTEM.md
Relevant verified observations from the audit:
- Current HEAD has global topbar, horizontal area tabs, contextual sidebar links and Copilot components; older docs NAVIGATION.md refer to six sidebar groups and might not match current code.
- STUDIO_NAV now uses four areas Plan & Calendar, Website Intelligence, Content Production and Operations; Overview is under Operations.
- Some route grouping and item ownership may be non-intuitive; no current browser verification.
These are CODE/HISTORICAL-EVIDENCE findings, not necessarily observations of the user's current browser or DB. Read audit docs for exact provenance. Compare Git history and migrations before editing.

## 4. PROBLEMS TO RESOLVE
- The user reports dual nav visually missing or ineffective; actual CSS/JS state must be reproduced before edits.
- Overview placement and structural grouping can force extra clicks; copilot should not consume navigation space or obscure content.
- Large forms/status blocks lack consistent hierarchy and progressive disclosure across screens.
Classify each as CONFIRMED CODE, HISTORICAL TEST or CURRENT RUNTIME HYPOTHESIS. Capture root cause and impact before writing fixes. Do not declare a user-specific runtime problem resolved on a theoretical code change alone.

## 5. TECHNICAL IMPLEMENTATION PLAN
1. Read ui-ux-pro-max and unslop skills if installed and follow their specific workflow, recording paths; otherwise state unavailable and use evidence-based design system.
2. Use Playwright snapshots from STUDIO-01 to analyze current shell at 1440/1024/390 and accessibility; never redesign blindly.
3. Define navigation policy: top horizontal global areas/site context; left sidebar contextual routes, assistant launcher, accessible collapse/expand; no duplicate nav item representation.
4. Prioritize Overview discoverability, Settings vs Admin placement, deep links, keyboard (Ctrl/Cmd+K, assistant), focus return, drawer Esc/backdrop behavior and session-aware site switching.
5. Update studio-nav.ts and shell with one route registry; preserve app.routes compatibility redirects and aria-current + role semantics.
6. Break page monoliths into feature components after contract ownership settled; reuse app-icon, dialogs, toasts, empty state and shared tokens without global CSS regressions.
7. Copilot includes current site/page/selected article context, evidence and operation confirmation; never auto-publish or change sensitive settings from an unconfirmed chat action.
Implementation discipline: derive precise API and state contracts from the existing models; protect tenant/site ownership; use additive migrations only if necessary with backfill and rollback. Add structured logs and human-actionable failure codes. Protect performance by avoiding duplicate reloads and N+1 calls. Use bounded retry/idempotency for side-effecting operations. Before removing any obsolete UI, trace its route, handlers, permissions and data usage.

## 6. UX/UI REQUIREMENTS
Design tokens, typography, spacing, nav density, responsive 390/1024/1440, tab lists, status chips, keyboard, contrast, error/loading/empty states; show before/after screenshots and objective test of task completion.
Use actual ui-ux-pro-max and unslop processes when available, follow current brand and design tokens, reuse shared components. Define primary CTA, secondary actions, loading/empty/error/success/partial states, keyboard/focus/ARIA, mobile layout and progressive disclosure. Show current vs changed screenshots before claiming UX PASS.

## 7. SEO REQUIREMENTS
Studio itself not public SEO landing; avoid replacing actual SEO evidence with decorative scores. Contextual actions to Site Intelligence and Plan should carry siteId.
Never manufacture volume, KD, rankings, GSC metrics or confirmed indexation. Label estimates and evidence dates. Respect existing public readable-semantic URL standards.

## 8. CROSS-SYSTEM INTEGRATIONS
Keep BFF auth, app context and Copilot threads; new nav must not bypass RBAC or expose unavailable functions.
Confirm effect on GuíaTV and other arbitrary website destinations, historical automation modes, Sources, Editorial Plan, Content, Calendar, background jobs and role permissions. Preserve contract compatibility and explicit user action boundaries.

## 9. DATA INTEGRITY AND SECURITY
No user content/schema deletion; retain active site, sidebar preferences when safe and copilot thread context. Never expose hidden admin route just because UI shows it.
No secrets in logs/commits/prompts/screenshots. Ensure RBAC and server-side tenant filtering, SSRF-safe web access, safe HTML, provider rate limits, rollback and historical IDs preservation.

## 10. TEST PLAN
- Existing Angular shell and copilot unit specs, app routing tests
- Playwright screenshots and keyboard journeys at 1440/1024/390, mobile drawers, a11y checks
- Site-switching and role-limited navigation, Copilot send/cancel/history with mocked provider
Repository commands: npm run typecheck; npm run build:studio; npm test (WARNING: invokes Prisma migrate deploy, run ONLY on an isolated test DB); npm run test:e2e. Use narrower targeted commands when appropriate; inspect package.json and actual Jest/Jasmine/Node/Playwright configuration. Never claim a test passed without running it.

## 11. OBJECTIVE ACCEPTANCE CRITERIA
- Top horizontal areas and left contextual sidebar are simultaneously visible and purposeful at desktop width.
- Mobile navigation accessible without overlap; copilot has deliberate entry point and close/focus semantics.
- Overview reachable immediately, navigation deep links preserved, no duplicate canonical actions.
- Current features reachable with documented owner and browser evidence before/after.
Attach exact endpoints, persisted entity transitions, sanitized response fragments, Playwright traces and reproducible steps. PASS only on verified behavior; remaining unavailable tools must be BLOCKED with explanation.

## 12. NON-REGRESSION GUARANTEES
Do not remove existing routes, notifications, auth guards, keyboard shortcuts, desktop preferences or Copilot safeguards.
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
Prior dependencies: STUDIO-01, STUDIO-02. Read prior milestone's evidence, contract docs and migration notes; verify its actual verdict rather than trusting a headline. Expected handoff to the next milestone: Consistent component/nav system to STUDIO-10/11.
At end produce Spanish report: current status, root causes, code changes, tests run, evidence URLs/paths, independent review, remaining risks, exact next prompt and dimension-level verdicts.
