# ADR 0001: GSD Pi is the Auctorio engineering runtime

Status: accepted
Date: 2026-09-16

## Decision

Auctorio uses the installed GSD Pi runtime as its only project orchestrator.
Project state is kept in the GSD Pi state directory created by the supported
runtime. Global provider routing, skills, Graphify, and Context Mode stay
outside the repository. `.engineering/` contains project context and quality
contracts, not another task runner.

## Consequences

Milestones and recovery are auditable through GSD Pi. Existing useful
architecture and migration history remains documentation, while the legacy
`.agentic/` runtime configuration is retired. Provider names and credentials
are resolved globally and are not duplicated in project files.

## Rejected alternatives

Adding a second agent framework, committing provider configuration, migrating
to a new unvalidated `.gsd/` layout by hand, or deleting historical evidence
would create competing ownership or lose context.
