# Auctorio baseline

Captured on 2026-09-15 before the GSD Pi ecosystem bootstrap changes.

## Repository state

- Branch: `main`
- Commit: `3ed9eb8f8920933c0e410f8c036b608f243cb336`
- Worktree: the sole linked worktree is `/home/manuelxose/workspace/auctorio`.
- Pre-existing dirty state: `package-lock.json` is modified. It was not
  inspected or changed by this task.
- Other pre-existing untracked material: `docs/superpowers/`. It was not
  changed by this task.

## Topology and runtime

Auctorio is a TypeScript content-generation and publishing platform built on
Fastify, Prisma, and BullMQ. The repository contains:

- API/domain/application/infrastructure code under `src/`, with worker entry
  points for text, image, scraping, publishing, discovery, scheduling,
  automation, and social workflows.
- A Studio web application at `apps/studio-web`.
- Prisma schema and migrations at `prisma/`.
- Unit/integration test sources under `tests/`, compiled test output under
  `dist/tests/`, and Playwright E2E specs/configuration under `e2e/`.
- Operations/deployment scripts under `scripts/` and systemd assets under
  `infra/systemd/`.

The manifest identifies `auctorio@0.1.0` and uses npm. Its main verification
scripts are `npm run typecheck`, `npm run build`, `npm run build:studio`,
`npm test`, and `npm run test:e2e`. `npm test` deploys Prisma migrations,
builds the API and Studio, then runs compiled Node tests.

## Services and configuration

Prisma targets PostgreSQL through the `DATABASE_URL` environment variable.
BullMQ and the CI workflow use Redis through `REDIS_URL`. The tracked
`.env.example` names configuration for application settings, queues, text and
image generation, publication, scraping, social integrations, web
intelligence, Studio authentication, media sources, and worker tuning.

Those identifiers establish supported configuration surfaces only. They do
not establish that any provider credential, endpoint, or third-party account
is configured.

## Existing automation

- `.github/workflows/ci.yml` runs on pushes to `main` and pull requests. It
  provisions PostgreSQL 16 and Redis 7, installs Node 22 dependencies with
  `npm ci`, checks migration/schema alignment, then typechecks, builds the API
  and Studio, and runs `npm test`.
- Deployment assets exist at `.github/workflows/deploy.yml`,
  `.github/workflows/rollback.yml`, and `scripts/deploy-production.sh`.
  Their execution and secret provisioning were not exercised.
- `e2e/playwright.config.ts` configures one worker, no retries, a 120-second
  test timeout, and a base URL from `E2E_BASE_URL` with a production-site
  fallback. It has no explicit browser-project matrix, trace-on-failure,
  screenshot-on-failure, console capture, or network capture settings.

## Engineering tooling and validation boundaries

Graphify 0.9.53 is installed and a current root graph exists at
`graphify-out/graph.json`; dated graph snapshots are also present. Context
Mode is available through this session’s MCP integration. The GSD and Pi
standalone commands are unavailable on `PATH`, although GSD/SDD planning
artifacts exist in `.superpowers/sdd/`.

This baseline is deliberately non-executing: no database, Redis, deployment,
credential, browser, E2E, or live-provider check was run. The only required
verification for this documentation task is whitespace integrity of the two
new Markdown files.
