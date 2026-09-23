# GSD Pi Ecosystem Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish and prove a fresh GSD Pi runtime for Auctorio, with reusable
configuration and factual baseline evidence.

**Architecture:** A host-level `gsd` binary runs project-local `.gsd/` state.
Tracked `.engineering/` documents provide project context and quality evidence;
credentials remain external. The old `.agentic/` configuration is deleted after
the clean GSD Pi install is proven functional.

**Tech Stack:** GSD Pi (`@opengsd/gsd-pi`), Node.js/npm, Git worktrees,
Graphify, Context Mode, Auctorio TypeScript/Prisma/Playwright tooling.

**Spec:** `docs/superpowers/specs/2026-09-15-gsd-pi-ecosystem-design.md`

## Global Constraints

- Use GSD Pi as the only primary engineering runtime for Auctorio.
- Do not alter the pre-existing `package-lock.json` modification.
- Do not commit provider secrets or hard-code API keys.
- Record every validation result as PASS, FAIL, or BLOCKED with evidence.
- Do not remove `.agentic/` until GSD Pi installation validation passes.

---

### Task 1: Capture environment and Auctorio baselines

**Files:**
- Create: `docs/engineering/environment-audit.md`
- Create: `docs/engineering/auctorio-baseline.md`

**Interfaces:**
- Consumes: host command versions, Auctorio Git state, `package.json`, CI,
  Docker, Playwright, Graphify, Context Mode, and provider configuration facts.
- Produces: an evidence-backed starting point for all later validation.

- [ ] **Step 1: Gather the environment facts without exposing secrets**

Run commands that report OS, shell, VS Code availability, Git/worktrees,
Node/npm/Python/Docker, installed GSD/Graphify/Context Mode/Playwright, and
Auctorio's tests, CI, deployment, and tracked environment templates.

- [ ] **Step 2: Write the audit table**

Use the exact columns `component`, `current state`, `version`, `status`, and
`action required`. Record unavailable tools as `MISSING`, and do not infer a
provider credential from the presence of an environment-variable name.

- [ ] **Step 3: Write the Auctorio baseline**

Document current commit/branch, dirty `package-lock.json`, project topology,
scripts, database/service dependencies, existing CI/deployment assets,
Graphify availability, and known validation boundaries.

- [ ] **Step 4: Verify documentation integrity**

Run: `git diff --check -- docs/engineering/environment-audit.md docs/engineering/auctorio-baseline.md`

Expected: exit code 0.

### Task 2: Install and prove GSD Pi before migrating Auctorio

**Files:**
- Create: `docs/engineering/gsd-pi.md`
- Create: a disposable validation repository outside Auctorio

**Interfaces:**
- Consumes: the official `@opengsd/gsd-pi` installer and Git.
- Produces: a working `gsd` command and reproducible installation/recovery
  instructions.

- [ ] **Step 1: Confirm no old GSD binary shadows the official release**

Run: `command -v gsd || true; npm ls -g --depth=0 @opengsd/gsd-pi gsd-pi || true`

Expected: the exact existing state is recorded before mutation.

- [ ] **Step 2: Install the supported runtime**

Run: `npx @opengsd/gsd-pi@latest --yes`

Expected: the guided installer completes and installs the `gsd` command without
writing credentials to Auctorio.

- [ ] **Step 3: Verify the installed binary**

Run: `command -v gsd && gsd --version`

Expected: a single executable path and a supported version are reported.

- [ ] **Step 4: Exercise runtime behavior in the disposable repository**

Initialize a new Git repository, run GSD initialization/configuration with a
provider available in the host, create a small planning task, execute a
non-destructive task in an isolated worktree, resume it, and force then recover
from a controlled failed task. Record commands and observed artifacts.

- [ ] **Step 5: Document exact bootstrap and recovery steps**

`docs/engineering/gsd-pi.md` must include install/version output, the runtime
validation matrix, state locations, provider credential boundary, worktree
behavior, resume/recovery evidence, routine upgrade command, and uninstall
instructions.

### Task 3: Migrate Auctorio to fresh GSD Pi project state

**Files:**
- Delete: `.agentic/POLICY.md`
- Delete: `.agentic/platform.json`
- Delete: `.agentic/repository-profile.json`
- Delete: `.agentic/agents/` (only files owned by the legacy platform)
- Create: `.engineering/CONTEXT.md`
- Create: `.engineering/quality/quality-gates.md`
- Create: `.engineering/scenarios/acceptance.md`
- Create: `.engineering/security/README.md`
- Create: `.engineering/production/README.md`
- Create: `.engineering/ADR/0001-gsd-pi-runtime.md`
- Create: `.gsd/` via GSD Pi initialization

**Interfaces:**
- Consumes: Task 1 baseline and Task 2 proven runtime.
- Produces: GSD Pi-owned state and project-scoped, reusable engineering inputs.

- [ ] **Step 1: Initialize GSD Pi from the Auctorio root**

Run the GSD Pi project initialization command in `/home/manuelxose/workspace/auctorio`.

Expected: `.gsd/` exists, is appropriate for the project, and state persists
across a restart.

- [ ] **Step 2: Add only portable project context**

Create `.engineering/CONTEXT.md` containing Auctorio scope, service and test
entrypoints, trust boundaries, and external dependencies. Keep routing and
credentials out of this file.

- [ ] **Step 3: Define objective quality gates and scenarios**

Record commands and prerequisites for build, typecheck, tests, Playwright,
security, release preflight, staging, observability, and rollback. Define
representative single-user, multi-user, and adversarial acceptance scenarios;
mark unknown product rules as requiring evidence instead of inventing them.

- [ ] **Step 4: Create the architectural decision record**

ADR 0001 states that GSD Pi owns runtime/planning/worktrees and Graphify and
Context Mode retain their separate intelligence/context responsibilities.

- [ ] **Step 5: Remove the legacy platform configuration**

Delete `.agentic/` after Steps 1–4 pass; its policy, platform, repository
profile, and role files are all legacy-owned. Do not delete backups or unrelated
editor configuration.

- [ ] **Step 6: Verify no stale runtime owner remains**

Run: `test -d .gsd && ! test -d .agentic && git diff --check`

Expected: exit code 0.

### Task 4: Configure providers and reusable onboarding template

**Files:**
- Create: `.engineering/quality/model-routing.md`
- Create: `.engineering/template/README.md`
- Create: `.engineering/template/CONTEXT.md`
- Create: `.engineering/template/quality-gates.md`
- Create: `.engineering/template/acceptance-scenarios.md`

**Interfaces:**
- Consumes: GSD Pi's configured provider mechanisms and Auctorio engineering
  inputs.
- Produces: logical model routing and a portable onboarding surface.

- [ ] **Step 1: Configure available providers through GSD Pi or external host configuration**

Configure DeepSeek, OpenAI/Codex, and Anthropic only when the required external
credential/authentication is present. For every unavailable provider, record
`BLOCKED` and the exact required host action; do not create placeholder keys.

- [ ] **Step 2: Document the routing policy**

Map `CHEAP` to discovery/repetitive work, `CODING` to implementation/tests,
`REASONING` to architecture/debugging/security/concurrency, and `REVIEW` to
independent review. Include automatic escalation triggers: failing validation,
security-sensitive changes, concurrency/data-loss paths, and repeated failed
attempts.

- [ ] **Step 3: Write the reusable template**

Provide only `CONTEXT.md`, project skills guidance, quality-gate overrides,
acceptance scenarios, and production/deployment inputs. It must contain no
Auctorio source paths, secrets, or generic runtime implementation code.

- [ ] **Step 4: Verify template portability**

Run a text scan for `auctorio`, secret-like assignments, and absolute Auctorio
paths in `.engineering/template/`.

Expected: no Auctorio-specific paths or credential values; an explanatory
template placeholder may name a replacement project only where clearly marked.

### Task 5: Establish executable project plan and quality evidence

**Files:**
- Create: GSD Pi plan/state artifacts under `.gsd/`
- Create: `docs/engineering/quality-matrix.md`
- Create: `docs/engineering/production-readiness.md`
- Create: `docs/engineering/model-usage-report.md`

**Interfaces:**
- Consumes: Tasks 1–4 and Auctorio's actual source/CI/runtime dependencies.
- Produces: GSD Pi executable tasks and evidence-based readiness reporting.

- [ ] **Step 1: Use GSD Pi to discover and plan Auctorio work**

Create authoritative tasks covering stabilization, backend, frontend, database,
authentication, integrations, testing, security, performance, CI/CD, staging,
observability, and production readiness where they exist. Each task must state
goal, dependencies, acceptance criteria, risk, complexity, model tier, affected
modules, and required validation.

- [ ] **Step 2: Run independent quality checks without weakening them**

Run Auctorio's declared build/typecheck/test/Playwright/release checks in the
documented dependency order. Preserve failure output as evidence; repair only
after an independently reviewed task identifies the root cause.

- [ ] **Step 3: Fill the quality matrix**

For build, typecheck, lint if configured, unit/integration/contract/database,
E2E/browser/accessibility/security/scenarios/performance/staging/observability/
deployment/rollback, record PASS, FAIL, or BLOCKED plus exact command, date,
preconditions, and evidence location.

- [ ] **Step 4: Produce readiness and model-usage reports**

Production readiness lists any accepted medium/low findings with severity,
impact, mitigation, owner, and follow-up. The usage report attributes executed
task classes to logical model tiers without exposing account identifiers,
tokens, or credentials.

- [ ] **Step 5: Obtain independent review before any production claim**

Use a separate provider/model tier to review configuration, deletion scope,
plan coverage, and evidence. Record findings and resolutions in the quality
matrix. Critical or high findings block readiness.

## Execution Notes

Tasks 1–2 may proceed without application changes. Task 3's deletion is allowed
only after Task 2 validation. Tasks 4–5 can be partially completed when external
credentials/infrastructure are absent, but all such boundaries remain BLOCKED.
