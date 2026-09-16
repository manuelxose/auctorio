# Auctorio engineering context

## Ownership

GSD Pi is the project workflow owner. It owns milestones, slices, task state,
execution checkpoints, verification, recovery, and resume. Provider selection,
credentials, and reusable skills remain in the user-scoped global platform.

Graphify supplies code-impact context; Context Mode supplies focused local
context; Ponytail keeps changes minimal. None of these tools owns product
state or replaces GSD Pi.

## Runtime boundary

- Backend: TypeScript, Fastify, Prisma, PostgreSQL, BullMQ, and Redis/Valkey.
- Studio: Angular 20 SSR/BFF under `apps/studio-web`.
- Media: local storage under `STORAGE_ROOT`, with tenant-scoped paths and Sharp
  derivatives.
- Deployment: `.github/workflows/`, `scripts/deploy-production.sh`, and the
  systemd service set documented by the deployment scripts.

## Trust boundaries

Validate tenant/site ownership at API and persistence boundaries. Treat feed,
HTML, AI, provider, OAuth, webhook, and uploaded media data as untrusted.
Never place credentials, tokens, private keys, or secret environment values in
this directory or in committed evidence.

## Source of truth

Live source and configuration outrank tests, GSD state, indexed context,
documentation, and historical plans. Tests must execute real assertions;
environment prerequisites are recorded as blockers rather than simulated.
