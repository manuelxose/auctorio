# Global GSD Pi Engineering Platform Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and configure one reusable GSD Pi engineering platform, migrate Auctorio only after the platform gate passes, and prove reuse from `guiatv-frontend`.

**Architecture:** User-scoped tools and provider sessions remain outside repositories. GSD Pi owns planning, execution, project state, worktrees, recovery, and resume; Graphify supplies code-impact context; Context Mode limits worker context; Ponytail and tactical skills constrain implementation. Auctorio and the second project add only project-specific `.gsd/` state and `.engineering/` inputs.

**Tech Stack:** GSD Pi 1.20.0, Node.js/npm, Codex, Claude Code, DeepSeek, Graphify, Context Mode, Ponytail, Matt Pocock skills, VS Code, Git, TypeScript, Prisma, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-gsd-pi-ecosystem-design.md`

## Global Constraints

- GSD Pi is the only primary engineering runtime.
- Provider secrets stay in authenticated sessions, protected user configuration, or environment stores; never in Git, prompts, or project files.
- `.agentic/` remains until GSD planning, execution, worktree, recovery, resume, and Auctorio migration evidence exists.
- Existing dirty files are user-owned; do not reset, overwrite, or delete unrelated changes.
- Every acceptance result is recorded as `PASS`, `FAIL`, or `BLOCKED` with command, expected result, actual result, and timestamp.
- A failed required gate blocks the next dependent phase; external-only limits are recorded as `BLOCKED`, never upgraded to `PASS`.
- Use Graphify before significant repository mutations and refresh it after structural changes.
- Use the smallest existing tool, dependency, or standard-library mechanism that meets the requirement.

---

### Task 1: Reconcile live audit and preserve user-owned state

**Files:**
- Modify: `docs/engineering/environment-audit.md` only where the live audit contradicts it
- Modify: `docs/engineering/gsd-pi.md` only where the live GSD evidence contradicts it
- Create: `docs/engineering/platform-evidence.md`

**Interfaces:**
- Consumes: live command availability, user-scoped configuration metadata, Auctorio Git status, existing audit documents.
- Produces: a current evidence ledger with no secret values and an explicit inventory of stale claims.

- [ ] **Step 1: Capture machine and repository facts without secret values**

Run `uname -srm`, `command -v`/`--version` for required tools, `git status --short --branch`, `git worktree list`, and protected-config metadata checks. Print only paths, versions, booleans, model IDs, and file modes.

- [ ] **Step 2: Classify each platform component**

Use the columns `component`, `location`, `version`, `scope`, `status`, `owner`, `conflicts`, and `required action`; distinguish installed, configured, executable, and validated.

- [ ] **Step 3: Record pre-existing dirty paths**

Capture the Auctorio status before any mutation and mark `package-lock.json`, existing untracked engineering docs, Graphify cache files, and any other pre-existing path as preserved user state.

- [ ] **Step 4: Verify documentation integrity**

Run `git diff --check` on every changed Markdown file and review the diff for secrets, fabricated results, and accidental deletion.

- [ ] **Step 5: Commit only the evidence documents**

Commit with `git add docs/engineering docs/superpowers/plans/2026-09-15-global-gsd-pi-rollout.md && git commit -m "docs: capture global platform rollout evidence"`; do not stage application or pre-existing dirty files.

### Task 2: Validate provider-backed GSD Pi in a disposable repository

**Files:**
- Create outside Git repositories: a temporary disposable validation repository
- Modify: `docs/engineering/platform-evidence.md`

**Interfaces:**
- Consumes: global Codex/Claude authenticated sessions and protected DeepSeek configuration.
- Produces: direct-provider and GSD-backed evidence for supported providers, plus explicit blocked boundaries.

- [ ] **Step 1: Validate the installed GSD owner**

Run `type -a gsd`, `npm ls -g --depth=0 @opengsd/gsd-pi gsd-pi`, and `gsd --version`; require exactly one supported `@opengsd/gsd-pi` owner.

- [ ] **Step 2: Create a disposable Git repository**

Create a `mktemp -d` directory outside Auctorio, initialize Git, add one seed file, and record the path and initial commit. Do not add it to any project repository.

- [ ] **Step 3: Run provider probes without exposing secrets**

Use the supported Codex and Claude CLI authenticated-session commands for one minimal inference and one coding/reasoning probe. For DeepSeek, read its protected GSD model configuration in-process and issue one minimal request without printing the key or response content.

- [ ] **Step 4: Run GSD-backed planning and execution**

Initialize GSD state in the disposable repository, create a non-destructive task, execute it headlessly through the configured provider, and record the resulting state, task artifact, provider, model tier, and exit status.

- [ ] **Step 5: Prove worktree, resume, and recovery behavior**

Run `gsd worktree list`, create one isolated task worktree, resume the task/session, and perform the documented preview-gated recovery flow for a controlled failed task. Never apply an unverified recovery token.

- [ ] **Step 6: Classify failures honestly**

For every failed command, record the exact command and external action required. Keep the disposable repository and recovery backup until evidence is captured, then remove only those explicitly disposable paths.

### Task 3: Make global routing and doctor checks executable

**Files:**
- Modify: `~/.gsd/PREFERENCES.md` only if validation proves an alias is missing or invalid
- Modify: `~/.local/bin/engineering-doctor`
- Create: `~/.local/bin/engineering-platform-probe` only if an existing command cannot express a required probe
- Modify: `docs/engineering/platform-evidence.md`

**Interfaces:**
- Consumes: provider probes from Task 2 and existing logical aliases `CHEAP`, `CODING`, `REASONING`, and `REVIEW`.
- Produces: secret-safe checks for routing, fallback, escalation, Graphify, Context Mode, Ponytail, skills, Playwright, Git, Node, Docker, and VS Code-terminal presence.

- [ ] **Step 1: Verify logical aliases before changing configuration**

Check that cheap/research, coding/execution, reasoning/planning, and review/verification aliases resolve to the intended provider family without scattering exact model names into repositories.

- [ ] **Step 2: Demonstrate fallback and escalation**

Run a disposable routing probe that records task class, selected tier, provider, fallback destination, attempt, reason, and result; use a forced harmless failure to demonstrate escalation without disabling the gate.

- [ ] **Step 3: Repair the doctor using native component checks**

Replace checks for nonexistent standalone commands with checks for the actual installed plugin/MCP/skill paths. Keep the doctor thin, exit nonzero on failures, use a distinct blocked status for VS Code restart-only checks, and never print credential values.

- [ ] **Step 4: Execute the doctor**

Run `engineering-doctor` from a normal shell and from the current VS Code integrated terminal. Record each line and classify restart-only checks separately.

- [ ] **Step 5: Validate Context Mode and Ponytail through their supported surfaces**

Run the available Context Mode diagnostic or MCP probe; invoke the global Ponytail skill on the doctor/configuration diff and record the concrete simplification decision it makes.

### Task 4: Validate Graphify, skills, browser tooling, and secrets

**Files:**
- Modify: `docs/engineering/platform-evidence.md`
- Create: `docs/engineering/global-skill-registry.md`

**Interfaces:**
- Consumes: installed Graphify graph, global skill directories, VS Code extensions, project-local Playwright dependency.
- Produces: evidence that platform intelligence and tactical skills execute, plus a secret scan with no credential values recorded.

- [ ] **Step 1: Run a scoped Graphify query**

Query Auctorio architecture and affected surfaces, use the result to choose the smallest later migration file set, and record the query, decision, and graph path.

- [ ] **Step 2: Validate the global skill registry**

Record source, version/commit, scope, purpose, compatible agents, trigger, conflicts, status, and last validation for GSD, Ponytail, Matt, UX/UI, security, QA, and browser skills. Invoke at least one tactical Matt skill on a disposable or documentation-only task.

- [ ] **Step 3: Exercise Playwright in a disposable browser target**

Run a project-local Playwright smoke against a minimal local page or the project’s existing configured target; capture browser, navigation, console, network, screenshot-on-failure, trace-on-failure, and accessibility evidence where the runner supports it.

- [ ] **Step 4: Scan tracked content for secret values**

Scan Git-tracked files and relevant global project configuration for API-key/token/private-key patterns while excluding protected credential stores and generated dependencies. Report findings without copying values.

- [ ] **Step 5: Run the global platform hard gate**

Write a checklist with `PASS`, `FAIL`, `BLOCKED`, or `NOT_APPLICABLE`. Do not start Auctorio migration unless every required non-external item is `PASS` and all external blockers are explicitly accepted as blockers.

### Task 5: Migrate Auctorio to project-owned GSD state

**Files:**
- Create: `auctorio/.gsd/` via GSD Pi, using the actual supported initialization path
- Create: `auctorio/.engineering/CONTEXT.md`
- Create: `auctorio/.engineering/ADR/0001-gsd-pi-runtime.md`
- Create: `auctorio/.engineering/quality/quality-gates.md`
- Create: `auctorio/.engineering/scenarios/acceptance.md`
- Create: `auctorio/.engineering/security/README.md`
- Create: `auctorio/.engineering/production/README.md`
- Delete only after the global gate: legacy-owned files under `auctorio/.agentic/`

**Interfaces:**
- Consumes: global gate evidence and Graphify-selected Auctorio surfaces.
- Produces: project-specific state/context with no generic provider or orchestration ownership.

- [ ] **Step 1: Re-check Auctorio state immediately before migration**

Run `git status --short --branch`, `git diff --stat`, and `graphify query` for the migration surfaces. Preserve all unrelated changes.

- [ ] **Step 2: Initialize GSD Pi in Auctorio**

Use the supported project initialization flow and verify `.gsd/gsd.db` or the actual version-specific state artifact exists, is Git-safe, and persists across a read-only restart/resume check.

- [ ] **Step 3: Add evidence-based project context**

Document Auctorio’s real Fastify, Prisma, BullMQ, Studio, deployment, trust-boundary, and test entrypoints. Keep provider routing, credentials, and generic orchestration out.

- [ ] **Step 4: Add quality, scenario, security, production, and ADR files**

Use actual scripts and CI configuration. Mark unknown workflows as requiring discovery; do not invent domain rules or acceptance outcomes.

- [ ] **Step 5: Remove only the proven legacy owner**

After GSD state/context checks pass, remove `.agentic/` legacy policy, platform, repository-profile, and role files while retaining `.agentic-platform-backups/` and unrelated editor configuration.

- [ ] **Step 6: Verify ownership direction**

Require `test -d .gsd`, `test -d .engineering`, `! test -d .agentic`, no provider secrets in Git, and `git diff --check` before committing the migration.

### Task 6: Plan, validate, and review Auctorio without fake completion

**Files:**
- Create: `auctorio/.engineering/quality/model-routing.md`
- Create: `auctorio/.engineering/template/README.md`
- Create: `auctorio/.engineering/template/CONTEXT.md`
- Create: `auctorio/.engineering/template/quality-gates.md`
- Create: `auctorio/.engineering/template/acceptance-scenarios.md`
- Create: `auctorio/docs/engineering/quality-matrix.md`
- Create: `auctorio/docs/engineering/production-readiness.md`
- Create: `auctorio/docs/engineering/model-usage-report.md`

**Interfaces:**
- Consumes: Auctorio GSD state, Graphify findings, `.engineering/` context, actual source/tests/CI, and provider routing.
- Produces: executable project plan and evidence-backed readiness status.

- [ ] **Step 1: Create the authoritative GSD plan**

Create tasks for only the real stabilization, backend, frontend, database, auth, integrations, security, testing, performance, CI/CD, staging, observability, and release gaps. Each task records dependencies, acceptance criteria, risk, complexity, tier, skills, affected modules, and validation.

- [ ] **Step 2: Run baseline quality gates in dependency order**

Run `npm run typecheck`, `npm run build`, `npm run build:studio`, `npm test`, `npm run test:e2e`, and applicable release/security scripts, recording exact output and prerequisites. Fix only implementation-caused failures through separate GSD tasks.

- [ ] **Step 3: Perform adversarial, concurrency, browser, and accessibility validation**

Discover real workflows first, then test duplicate submissions, rapid actions, stale state, auth expiry, malformed input, provider failure, multiple sessions/tabs, keyboard/focus, responsive behavior, console, and network evidence where applicable.

- [ ] **Step 4: Run independent review**

Review architecture, maintainability, complexity, acceptance criteria, runtime behavior, security, tests, deletion scope, and evidence with a provider different from the implementer when available. Reject or repair concrete findings.

- [ ] **Step 5: Classify readiness**

Mark Critical/High security or correctness findings as blocking. Record staging, observability, deployment, rollback, and performance as `PASS`, `FAIL`, or `BLOCKED`; never equate build success with production readiness.

### Task 7: Prove second-project reuse in GuiaTV

**Files:**
- Create: `guiatv-frontend/.engineering/CONTEXT.md` only if absent
- Create: `guiatv-frontend/.engineering/quality/quality-gates.md` only if absent
- Create: `guiatv-frontend/.engineering/scenarios/acceptance.md` only if absent
- Create: `docs/engineering/second-project-reuse.md`

**Interfaces:**
- Consumes: the same user-scoped GSD, provider auth, routing, Graphify, Context Mode, Ponytail, Matt, UX/UI, and Playwright installations.
- Produces: evidence that project-specific context is isolated and no platform duplication was introduced.

- [ ] **Step 1: Audit GuiaTV before changes**

Read its local instructions, GSD state, Graphify graph, package manifest, and existing platform/config paths; capture status and preserve dirty files.

- [ ] **Step 2: Initialize or resume only project-local state**

Use the already installed GSD command and global providers. Do not install a second CLI, copy Auctorio orchestration, or add provider secrets.

- [ ] **Step 3: Execute one bounded project task**

Use Graphify and Context Mode to scope it, Ponytail to challenge unnecessary work, the appropriate tactical skill, and Playwright if the task is frontend-facing. Record the task artifact and validation.

- [ ] **Step 4: Prove reuse and isolation**

Verify the resolved global command paths, provider session reuse, global skill paths, absence of duplicated credentials/routing, project-specific context isolation, and clean Git diff.

### Task 8: Final evidence and handoff

**Files:**
- Modify: `docs/engineering/platform-evidence.md`
- Modify: `docs/engineering/second-project-reuse.md`
- Create: `docs/engineering/final-acceptance-report.md`

**Interfaces:**
- Consumes: all prior evidence and unresolved blockers.
- Produces: one final report separating PASS, FAIL, BLOCKED, and not-run items with exact next actions.

- [ ] **Step 1: Re-run the doctor and essential version checks**

Run the global doctor, `gsd --version`, `graphify --version`, provider auth status commands, and repository status checks from the supported shells.

- [ ] **Step 2: Check evidence integrity**

Run `git diff --check`, a secret-pattern scan, and a report consistency review. Remove no user-owned data.

- [ ] **Step 3: Publish the final acceptance report**

Report separate platform, Auctorio, and second-project statuses. Include blocked external actions and do not claim overall completion unless every required gate is proven.

