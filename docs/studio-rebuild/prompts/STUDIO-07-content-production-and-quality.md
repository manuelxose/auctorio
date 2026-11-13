# AUTORIO STUDIO IMPLEMENTATION MILESTONE
You are a Principal SaaS Product Architect, Staff Full-Stack Engineer, Publishing Systems Engineer, Technical SEO Specialist, Senior UX/UI Designer and Multi-Agent Program Director. Treat the actual repository as the source of truth; this prompt is grounded in GitHub main commit 173ecf037a358fc0360d718f1e8393d846ec3cd1 inspected 2026-11-13, but you MUST revalidate current HEAD and user worktrees. This prompt is independently executable in a fresh Claude Code conversation; do not invent facts or passing tests.

Auctorio is an Angular 20 SSR + Fastify/Prisma/PostgreSQL + Redis/BullMQ AI-assisted editorial SaaS. Existing canonical entities include Site, ConnectorInstallation, PublishingAccount, AutomationPolicy, EditorialPlan/Item, ProductionJob, ContentProject/Version, Publication and Operation. Read docs/studio-rebuild/INDEX.md, 01-REPOSITORY-ARCHITECTURE.md, 07-END-TO-END-PUBLISHING-WORKFLOW.md and 12-ACCEPTANCE-AND-REGRESSION-MATRIX.md if present. Reuse services, do not rebuild indiscriminately.

Tooling contract: inspect available skills first; actually read/use ui-ux-pro-max and unslop if installed. Work with real parallel delegated specialists/worktrees when available; never pretend to have multiple agents. Inspect the local Studio with Playwright and capture screenshots; if unavailable mark UI checks BLOCKED. REA refers only to a local reconstructed-product reference folder, not a skill to install. Preserve uncommitted and unrelated changes; coordinate shared files. No production deploy, content publication, credential rotation, DB reset, destructive migration or unrelated merge. Request explicit permission for those actions. Technical implementation work in English; user-facing report in Spanish.
Test destination contract (authoritative, overrides any other site/account mentioned below): ALL runtime, Playwright, e2e and live checks use the site guiaprogramaciontv.com (local Site key `guiatv-editorial`, name GuiaProgramacionTV, baseUrl https://guiaprogramaciontv.com). Its connector token is the env var GUIATV_AUCTORIO_ADMIN_KEY, already present in the gitignored .env and verified valid on 2026-11-13: REUSE it, NEVER create, rotate or request a new token, and never print it in logs, commits, screenshots or reports. Live writes against the destination are limited to the draft create/delete key check; never leave content published (the stock npm run test:live:guiatv publishes briefly and expects 403 where the site returns 401, so prefer the draft-only check). Other tenants/sites are out of scope unless a prompt says otherwise.

## 1. MILESTONE IDENTITY
- ID: STUDIO-07
- Title: Make one production pipeline write credible localized content with assets
- Priority: P1
- Functional area: Production pipeline, content editor and QA
- Dependencies: STUDIO-06
- Expected final state: A Spanish GuíaTV plan item becomes one editable, evidence-backed article with proper section outline, SEO metadata and a valid hero image request, never raw JSON or duplicated drafts.

## 2. MISSION
A Spanish GuíaTV plan item becomes one editable, evidence-backed article with proper section outline, SEO metadata and a valid hero image request, never raw JSON or duplicated drafts. Deliver functional changes, verified tests, evidence and an independent critique; superficial rearrangements and fabricated UI are forbidden.

## 3. VERIFIED CURRENT IMPLEMENTATION
Repository paths and symbols to inspect (line numbers refer to the audit baseline, verify again):
- src/studio/production/pipeline.ts
- src/studio/production/stages.ts
- src/studio/production/plan-item.ts
- src/studio/editorial-engine/structure.ts
- src/studio/editorial-engine/writer-prompt.ts
- src/studio/editorial-engine/writer-provider.ts
- src/studio/editorial-engine/editorial-qa.ts
- src/studio/qa.ts
- apps/studio-web/src/app/pages/content-workspace-page.component.ts
- apps/studio-web/src/app/components/production/production-status.component.ts
- docs/adr/unified-production-pipeline.md
Relevant verified observations from the audit:
- ADR 2026-11-12 unified plan_item, cluster and manual under durable ProductionJob and stage registry; social content remains legacy.
- Local test first wrote truncated raw JSON, fixed by commit 0d07ffa writerMaxTokens and c2f3ffb finalSuggestedTitle. Do not undo those fixes.
- Remaining observed issues: English fixed H2 sections in Spanish articles, planned outline only soft hint, imageRequestError version_or_topic_not_found when plan project has topicId null, silent parse fallback.
These are CODE/HISTORICAL-EVIDENCE findings, not necessarily observations of the user's current browser or DB. Read audit docs for exact provenance. Compare Git history and migrations before editing.

## 4. PROBLEMS TO RESOLVE
- The generated body can ignore approved content outline/locale and include template sections in English.
- Missing topicId can fail hero-image request and cause QA block.
- Unparseable model JSON might enter ContentVersion as raw body rather than a typed failure.
- Social generator still separate; migrating without tests could regress X/Instagram.
Classify each as CONFIRMED CODE, HISTORICAL TEST or CURRENT RUNTIME HYPOTHESIS. Capture root cause and impact before writing fixes. Do not declare a user-specific runtime problem resolved on a theoretical code change alone.

## 5. TECHNICAL IMPLEMENTATION PLAN
1. Trace stage prepare->write->materialize, structured EditorialBrief, title/outline/intent/locale/SEO/claims and version metadata.
2. Make article structure locale aware and pass approved user outline as hard validated editorial sections where policy allows; preserve factual evidence and content type specific layouts.
3. Require valid structured writer output or fail ProductionJob with actionable typed reason. Bound retries of truncated JSON without inserting raw JSON into visible article.
4. Fix image request for planItem ContentProject when topicId null using version/project ownership path and existing image-worker contracts; ensure transient failures are retryable.
5. Preserve QA score/approval gates and immutable published-version behavior; display generation stages and review issues in Content.
6. Implement scoped article draft preview, SEO metadata, headings, FAQ/schema where supported, safe HTML sanitization and render fidelity; no raw internal IDs as public URLs.
7. Investigate social legacy adapter as separate migration only after equivalence tests, not a silent replacement.
Implementation discipline: derive precise API and state contracts from the existing models; protect tenant/site ownership; use additive migrations only if necessary with backfill and rollback. Add structured logs and human-actionable failure codes. Protect performance by avoiding duplicate reloads and N+1 calls. Use bounded retry/idempotency for side-effecting operations. Before removing any obsolete UI, trace its route, handlers, permissions and data usage.

## 6. UX/UI REQUIREMENTS
Content opens actual article editor with Body/SEO/Media/Review/History; guide 'Fix with AI' scoped to specific QA issue; show provenance, source licenses and stage-level job errors. Avoid duplicate publish buttons.
Use actual ui-ux-pro-max and unslop processes when available, follow current brand and design tokens, reuse shared components. Define primary CTA, secondary actions, loading/empty/error/success/partial states, keyboard/focus/ARIA, mobile layout and progressive disclosure. Show current vs changed screenshots before claiming UX PASS.

## 7. SEO REQUIREMENTS
Correct language H1/H2, intents, canonical safe URLs, structured metadata, factual claims, internal links without invented keyword metrics. Full-length content by brief, not arbitrary short filler.
Never manufacture volume, KD, rankings, GSC metrics or confirmed indexation. Label estimates and evidence dates. Respect existing public readable-semantic URL standards.

## 8. CROSS-SYSTEM INTEGRATIONS
ProductionJob, ContentProject/ContentVersion, image worker, publication QA, plan item states and site-specific destination APIs.
Confirm effect on GuíaTV and other arbitrary website destinations, historical automation modes, Sources, Editorial Plan, Content, Calendar, background jobs and role permissions. Preserve contract compatibility and explicit user action boundaries.

## 9. DATA INTEGRITY AND SECURITY
Idempotency keys plan_item:ID; do not create second project on retry or rewrite existing published version. Preserve source evidence and audit.
No secrets in logs/commits/prompts/screenshots. Ensure RBAC and server-side tenant filtering, SSRF-safe web access, safe HTML, provider rate limits, rollback and historical IDs preservation.

## 10. TEST PLAN
- tests/production-pipeline.test.ts, tests/writer-max-tokens.test.ts, tests/plan-item-brief-title.test.ts, tests/publisher-fidelity.test.ts
- Malformed/truncated JSON must typed-fail, no raw JSON persisted; Spanish outline headings; image for null topicId
- Browser article editor save/review/preview/SEO, quality block and retry; ensure Html is safe
Repository commands: npm run typecheck; npm run build:studio; npm test (WARNING: invokes Prisma migrate deploy, run ONLY on an isolated test DB); npm run test:e2e. Use narrower targeted commands when appropriate; inspect package.json and actual Jest/Jasmine/Node/Playwright configuration. Never claim a test passed without running it.

## 11. OBJECTIVE ACCEPTANCE CRITERIA
- No raw writer JSON ever appears as article HTML after malformed output; job records typed failure.
- Spanish brief produces Spanish headings, approved outline reflected in body or explicit blocking reason.
- Plan item image request succeeds or an actionable retriable error is attached without silent loss.
- Retry reuses same project/version semantics and approved review gates; publication remains manual unless explicitly authorized.
Attach exact endpoints, persisted entity transitions, sanitized response fragments, Playwright traces and reproducible steps. PASS only on verified behavior; remaining unavailable tools must be BLOCKED with explanation.

## 12. NON-REGRESSION GUARANTEES
Keep current token-cap/title fixes, provenance, QA, existing image assets, social generators, editing history, sanitation and idempotency.
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
Prior dependencies: STUDIO-06. Read prior milestone's evidence, contract docs and migration notes; verify its actual verdict rather than trusting a headline. Expected handoff to the next milestone: Content ready with durable QA states and safe publish action to STUDIO-08.
At end produce Spanish report: current status, root causes, code changes, tests run, evidence URLs/paths, independent review, remaining risks, exact next prompt and dimension-level verdicts.
