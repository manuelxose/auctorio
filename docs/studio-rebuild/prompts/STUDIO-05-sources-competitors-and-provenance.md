# AUTORIO STUDIO IMPLEMENTATION MILESTONE
You are a Principal SaaS Product Architect, Staff Full-Stack Engineer, Publishing Systems Engineer, Technical SEO Specialist, Senior UX/UI Designer and Multi-Agent Program Director. Treat the actual repository as the source of truth; this prompt is grounded in GitHub main commit 173ecf037a358fc0360d718f1e8393d846ec3cd1 inspected 2026-11-13, but you MUST revalidate current HEAD and user worktrees. This prompt is independently executable in a fresh Claude Code conversation; do not invent facts or passing tests.

Auctorio is an Angular 20 SSR + Fastify/Prisma/PostgreSQL + Redis/BullMQ AI-assisted editorial SaaS. Existing canonical entities include Site, ConnectorInstallation, PublishingAccount, AutomationPolicy, EditorialPlan/Item, ProductionJob, ContentProject/Version, Publication and Operation. Read docs/studio-rebuild/INDEX.md, 01-REPOSITORY-ARCHITECTURE.md, 07-END-TO-END-PUBLISHING-WORKFLOW.md and 12-ACCEPTANCE-AND-REGRESSION-MATRIX.md if present. Reuse services, do not rebuild indiscriminately.

Tooling contract: inspect available skills first; actually read/use ui-ux-pro-max and unslop if installed. Work with real parallel delegated specialists/worktrees when available; never pretend to have multiple agents. Inspect the local Studio with Playwright and capture screenshots; if unavailable mark UI checks BLOCKED. REA refers only to a local reconstructed-product reference folder, not a skill to install. Preserve uncommitted and unrelated changes; coordinate shared files. No production deploy, content publication, credential rotation, DB reset, destructive migration or unrelated merge. Request explicit permission for those actions. Technical implementation work in English; user-facing report in Spanish.
Test destination contract (authoritative, overrides any other site/account mentioned below): ALL runtime, Playwright, e2e and live checks use the site guiaprogramaciontv.com (local Site key `guiatv-editorial`, name GuiaProgramacionTV, baseUrl https://guiaprogramaciontv.com). Its connector token is the env var GUIATV_AUCTORIO_ADMIN_KEY, already present in the gitignored .env and verified valid on 2026-11-13: REUSE it, NEVER create, rotate or request a new token, and never print it in logs, commits, screenshots or reports. Live writes against the destination are limited to the draft create/delete key check; never leave content published (the stock npm run test:live:guiatv publishes briefly and expects 403 where the site returns 401, so prefer the draft-only check). Other tenants/sites are out of scope unless a prompt says otherwise.

## 1. MILESTONE IDENTITY
- ID: STUDIO-05
- Title: Make source discovery and competitor analysis relevant to each site's market
- Priority: P1
- Functional area: Sources / Competitors / evidence registry
- Dependencies: STUDIO-04
- Expected final state: A Spanish TV guide receives useful Spanish-market TV/streaming sources, relevant competitors and traceable provenance instead of generic English movie feeds.

## 2. MISSION
A Spanish TV guide receives useful Spanish-market TV/streaming sources, relevant competitors and traceable provenance instead of generic English movie feeds. Deliver functional changes, verified tests, evidence and an independent critique; superficial rearrangements and fabricated UI are forbidden.

## 3. VERIFIED CURRENT IMPLEMENTATION
Repository paths and symbols to inspect (line numbers refer to the audit baseline, verify again):
- apps/studio-web/src/app/pages/sources-page.component.ts
- apps/studio-web/src/app/components/sources/site-source-registry.component.ts
- src/studio/source-registry-discovery.ts
- src/studio/source-packs/movie-tv-en.ts
- src/studio/source-quality.ts
- src/studio/sources.ts
- src/studio/competitors/index.ts
- src/studio/competitors/routes.ts
- src/studio/routes-source-registry.ts
- docs/acceptance/guiatv-local-2026-11-12.md
Relevant verified observations from the audit:
- On 12-Nov GuíaTV source recommendations were 21 English movie feeds and no first-party sources; two accepted feeds did yield items after fetching, so ingestion itself works.
- Competitors suggested sites like wa.me and tecnoriasl.com; only 2 of 8 verified.
- SourcesPage is 1477 lines; source management, recommendation, adapter diagnostics and registry are mixed.
These are CODE/HISTORICAL-EVIDENCE findings, not necessarily observations of the user's current browser or DB. Read audit docs for exact provenance. Compare Git history and migrations before editing.

## 4. PROBLEMS TO RESOLVE
- Domain/locale signal is too weak to select relevant sources and competitors.
- First-party canonical feeds/sitemap and source trust/reuse are not recommended effectively.
- Users cannot easily tell which external source contributed which planning evidence.
- Technical source controls and AI/provider diagnostics crowd common usage.
Classify each as CONFIRMED CODE, HISTORICAL TEST or CURRENT RUNTIME HYPOTHESIS. Capture root cause and impact before writing fixes. Do not declare a user-specific runtime problem resolved on a theoretical code change alone.

## 5. TECHNICAL IMPLEMENTATION PLAN
1. Inventory supported RSS/Atom/sitemap/HTML/API/manual adapters and content source models. Keep existing adapters and health states.
2. Build generic site-domain+locale+source-type classification and scoring: authority, relevance, primary/first-party, license, language/region, freshness, verification outcome; reject outbound links not actually competing publications.
3. Offer candidate feeds from connected site itself and curated legal licensed sources where available; do not fabricate providers; sources require verified URLs and supported terms.
4. Deduplicate source recommendations by normalized canonical origin/URL and tenant/site scope, preserving accepted items.
5. Refactor SourcesPage into source list/health, recommendation review, and detail/drawer with advanced diagnostics; keep one code path for add/test/fetch/disable.
6. Competitors become a distinct contextual category with verified overlap evidence and user approval. Send valuable competitor gaps to Editorial Plan, not automatic article generation.
7. Preserve immutable provenance from SourceItem/SourceEvidence to PlanItem and ContentVersion; maintain attribution/license checks.
Implementation discipline: derive precise API and state contracts from the existing models; protect tenant/site ownership; use additive migrations only if necessary with backfill and rollback. Add structured logs and human-actionable failure codes. Protect performance by avoiding duplicate reloads and N+1 calls. Use bounded retry/idempotency for side-effecting operations. Before removing any obsolete UI, trace its route, handlers, permissions and data usage.

## 6. UX/UI REQUIREMENTS
User first sees Active sources, Suggestions needing approval and Recent evidence; show language, category, last fetch, permissions/reason, failure. Advanced contains adapter settings, circuits and provider diagnostics.
Use actual ui-ux-pro-max and unslop processes when available, follow current brand and design tokens, reuse shared components. Define primary CTA, secondary actions, loading/empty/error/success/partial states, keyboard/focus/ARIA, mobile layout and progressive disclosure. Show current vs changed screenshots before claiming UX PASS.

## 7. SEO REQUIREMENTS
No keyword volume or competitor ranking claims without licensed data; source relevance and content gap are inferred, explicitly labeled.
Never manufacture volume, KD, rankings, GSC metrics or confirmed indexation. Label estimates and evidence dates. Respect existing public readable-semantic URL standards.

## 8. CROSS-SYSTEM INTEGRATIONS
/v2/sites/:siteId/source-recommendations; /v2/sources; /v2/sites/:siteId/competitors, /opportunities and /source-evidence feed Editorial Plan and content QA.
Confirm effect on GuíaTV and other arbitrary website destinations, historical automation modes, Sources, Editorial Plan, Content, Calendar, background jobs and role permissions. Preserve contract compatibility and explicit user action boundaries.

## 9. DATA INTEGRITY AND SECURITY
No destructive source cleanup; retain accepted source IDs, source items, source pack import history, tenant isolation, provenance and legal attribution.
No secrets in logs/commits/prompts/screenshots. Ensure RBAC and server-side tenant filtering, SSRF-safe web access, safe HTML, provider rate limits, rollback and historical IDs preservation.

## 10. TEST PLAN
- tests/source-quality.test.ts, tests/source-registry.test.ts, tests/sources-competitors.test.ts
- GuíaTV-specific multilingual fixture validating no English-only movie default when TV programming priority high
- Playwright Sources add/test/fetch, competitor approve/reject, health/error and provenance-to-plan
Repository commands: npm run typecheck; npm run build:studio; npm test (WARNING: invokes Prisma migrate deploy, run ONLY on an isolated test DB); npm run test:e2e. Use narrower targeted commands when appropriate; inspect package.json and actual Jest/Jasmine/Node/Playwright configuration. Never claim a test passed without running it.

## 11. OBJECTIVE ACCEPTANCE CRITERIA
- In the GuíaTV fixture the first-party site and relevant language-market signal affect ordering; no wa.me-style false competitor is approved by default.
- A verified feed can test/fetch and produce traceable evidence used by an article plan.
- Sources actions are not duplicated and do not leak API/provider credentials.
- Source ranking can explain why each recommendation was made.
Attach exact endpoints, persisted entity transitions, sanitized response fragments, Playwright traces and reproducible steps. PASS only on verified behavior; remaining unavailable tools must be BLOCKED with explanation.

## 12. NON-REGRESSION GUARANTEES
Keep all adapter formats, users' stored sources and source item status transitions; no unapproved bulk remove or external fetch at scale.
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
Prior dependencies: STUDIO-04. Read prior milestone's evidence, contract docs and migration notes; verify its actual verdict rather than trusting a headline. Expected handoff to the next milestone: Stable source evidence and verified opportunities to STUDIO-06; diagnostic panels to STUDIO-10.
At end produce Spanish report: current status, root causes, code changes, tests run, evidence URLs/paths, independent review, remaining risks, exact next prompt and dimension-level verdicts.
