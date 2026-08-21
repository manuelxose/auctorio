# Auctorio → GuiaTV Production Acceptance Evidence

Date: 2026-08-21
Executor: automated implementation pass driven from Studio API + Playwright UI

## Release identity

- Git commits: `1ff7864` → `b6ccdd3` (P0 functionalization series), branch `main`, pushed to `manuelxose/auctorio`.
- Deployment: `content-ai-api`, 4 workers and Studio SSR restarted on the production VPS; Studio release published via `bin/deploy-auctorio-studio.sh`.
- Environment: `APP_ENV=production`, `NODE_ENV=production`, `PUBLISH_DRY_RUN=false`.
- Database migrations applied: `20260821100000_image_states_and_og_variant`, `20260821110000_publication_idempotency`.

## Test suite results

- Unit/integration: **42/42 pass** (`node --test dist/tests/**/*.test.js`).
- Typecheck: pass. Backend build: pass. Studio production build: pass.
- Playwright E2E (production Studio SSR, real login): **1/1 pass** — session, project creation, detail workbench render, projects list.
- Live GuiaTV contract suite (`npm run test:live:guiatv`): **PASS** — 403 without admin key, 201 create, 400 invalid `relatedRouteKeys`, 200 update same id, 200 delete, 404 after delete.
- Restore rehearsal: `pg_dump` (40 KB) → restore into scratch DB → counts matched (4 tenants, 2 projects, 5 publication jobs, 3 versions). Backup cron installed (`/etc/cron.d/auctorio-backup`: daily DB + storage, 7/3-day retention).

## Workflow evidence (real services, real GuiaTV)

| Step | Artifact |
|------|----------|
| Studio login (QA admin, workspace guiaprogramaciontv) | 200, session cookie |
| Project created | `f6ec849c-2b0e-4ba5-a369-6df3cd044ce5` — "Guia para ver futbol en streaming en Espana..." |
| Text generation (DeepSeek deepseek-chat, real) | version v1 `8867a5c5-aa06-4074-9857-9be1944fc22e`, text `4f9389f1-04d6-474d-855d-db3d6d362d2d`, 466 words, H2s, SEO fields |
| Image generation (SiliconFlow FLUX.2-pro, real) | image `b544b95f-6e78-4413-8420-2105379cb6a0`, status done, variants `original,hero,og,thumbnail` |
| QA | passed (0 blockers); reviewGate `ready_to_approve` |
| Approval | v1 approved (admin user) |
| Draft sync (real GuiaTV POST /v2/blog) | job `36ff704f-ba47-4cce-af66-7c061c26fc1d` → `draft_synced` |
| GuiaTV draft verified | externalId **`6a8899c401e4615fa0cc2403`** (real, not `dryrun-`), slug `guia-ver-futbol-streaming-espana`, title, excerpt, featured image, categories (2), relatedPlatformKeys, relatedRouteKeys, FAQ (2), SEO metaTitle/metaDescription/keywords/ogImage all present |
| Asset reachability | `https://auctorio.com/assets/0bbc735e.../b544b95f...jpg` → 200 `image/jpeg` 365 KB; `.../derivatives/b544b95f.../hero.webp` → 200 `image/webp` |
| Revision → v2 | version `ce29eeac-f5e4-414b-baea-40605621daaf`, 480 words, new image `35262b1f-f7c9-4252-bb68-cee9dd5e62dd`, QA passed |
| Draft update (same id) | job `2a4a4670-0fa0-4aed-93e8-e057aa96b97a` → `draft_synced`, **same externalId**, GuiaTV has exactly **one** post for the slug (no duplicate) |
| Publish (real) | job `cc961bdf-7296-41d3-bde4-27179de1fff1` → `published`, externalId `6a8899c401e4615fa0cc2403` |
| Public URL verified | `https://guiaprogramaciontv.com/editorial/guia-ver-futbol-streaming-espana` → HTTP 200, title, canonical, OG image, body content, FAQ rendered |
| Withdraw (real) | job `5e855f03-9246-438e-86c6-2d1a2356b048` → `canceled`; GuiaTV admin API returns `[]` for the slug — post deleted remotely |

## Reliability changes shipped in this pass

- Fail-fast production guards: `TEXT_PROVIDER=mock`/`IMAGE_PROVIDER=mock`/missing provider config throws at worker start in production; publishing with missing credentials throws `publishing_missing_credentials` instead of silently dry-running.
- SiliconFlow download pipeline: b64-first, robust URL download with timeout, exponential backoff + jitter retries, redirects, content-type check, 25 MB cap, magic-byte signature validation, classified errors (`image_download_*`, retryable flag), IPv4/IPv6 auto-select.
- Image derivatives (sharp): original + `hero` (1280×720), `og` (1200×630), `thumbnail` (480×270) WebP variants persisted as `AssetVariant` rows.
- Image lifecycle: `queued/processing/done/failed/retryable`; Studio "Retry image" action + `/v2/content-images/:id/retry`.
- Canonical review gate with structured issues (`{code, severity}`), hero-readiness (status done + hero variant) as blocking check.
- GuiaTV contract reconciliation: real admin API base `/v2/blog`, payload validation/mapping (contentType aliases, relatedRouteKeys/relatedPlatformKeys whitelists), admin-key rejection classification.
- Publication idempotency: `idempotency_key` unique per (tenant, site, project, version, action, target), in-flight reuse, retry-after-failure reset, queue-level duplicate guard, unique BullMQ job ids.
- Worker retries: `WORKER_MAX_ATTEMPTS` (3) + exponential backoff (2s) on all queues; job attempts tracking.
- API hardening: standardized `{error:{code,message,requestId}}` envelopes, 404 handler, global error handler, storage writability probe in `/health/ready`, new `/health/destinations`.
- GuiaTV-specific editorial generation profile (builtin prompt guidance for TV/streaming/football formats).
- CI: GitHub Actions workflow (postgres service, migration-vs-schema validation, typecheck, build, build:studio, test).
- Deployment reproducibility: all 6 systemd units mirrored in `infra/systemd/`, env matrix documented in `docs/environment-audit.md`.
- Backups: daily DB + storage cron with retention; restore rehearsal executed.

## Known residuals

- `talkaris-blog` destination is unreachable from the VPS (6 s timeout in `/health/destinations`) — operator follow-up.
- Seeded demo site `bootstrap-webhook` (baseUrl `https://example.test`) still exists with one legacy project; surfaced honestly as unreachable.
- GuiaTV SSR may serve the withdrawn slug from its own page cache briefly; the GuiaTV data store confirms deletion.
- P1/P2 backlog (scorecards, analytics depth, social publishing Instagram/LinkedIn, etc.) remains per the master plan ordering.
