# GSD Pi Engineering Ecosystem Design

## Purpose

Make GSD Pi the single engineering runtime for Auctorio and provide a reusable,
project-local template for future repositories. Auctorio is the reference pilot;
application code remains free of generic orchestration code.

## Decisions

- Install the supported `@opengsd/gsd-pi` release from the official
  `open-gsd/gsd-pi` repository.
- Use `.gsd/` as the only runtime-owned project state. GSD Pi owns planning,
  worktrees, task execution, recovery, and runtime state.
- Delete Auctorio's existing `.agentic/` configuration rather than maintain a
  compatibility layer. Preserve unrelated files and the pre-existing modified
  `package-lock.json`.
- Keep model credentials outside version control. Routing selects logical tiers
  (`CHEAP`, `CODING`, `REASONING`, `REVIEW`) rather than application code or
  hard-coded keys.
- Keep Graphify responsible for repository relationships and Context Mode for
  context control. Both are validation aids, not competing orchestrators.

## Architecture

The host installation supplies `gsd`; each project adds `.gsd/` state plus a
small `.engineering/` directory for durable project context, acceptance
scenarios, quality-gate overrides, security notes, production evidence, and
project-specific skills. Provider setup remains in user-managed GSD Pi and
environment configuration; tracked files document required variables but never
contain values.

The rollout is ordered: establish an evidence-backed baseline, install and
exercise GSD Pi in a disposable validation repository, initialize Auctorio,
then run project quality gates and record factual PASS, FAIL, or BLOCKED
outcomes. A reusable template is derived only from configuration and evidence,
not copied runtime code.

## Validation and Failure Handling

GSD Pi must prove startup, initialization, persisted state, planning, task
execution, Git/worktree isolation, resume, and recovery before it becomes the
runtime for Auctorio. Auctorio evidence includes its declared build, typecheck,
unit/integration, Playwright, security, and release checks when their dependent
services and credentials are available.

Missing provider credentials, databases, browser binaries, deployment access,
or staging infrastructure are explicit BLOCKED boundaries. They are documented
with the required external action and never reported as passing.

## Rollout Phases

1. Environment and Auctorio baseline audit.
2. Fresh GSD Pi installation and disposable runtime validation.
3. Auctorio migration and reusable configuration/template.
4. Auctorio discovery, executable GSD plan, and controlled task execution.
5. Quality, independent review, staging, and production-readiness evidence.

## Non-Goals

- Replacing Auctorio's product architecture without a defect or approved task.
- Storing provider credentials, generic orchestration code, or fake validation
  evidence in Auctorio.
- Treating a successful build as production readiness.
