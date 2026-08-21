# Auctorio Environment & Configuration Audit

Updated: 2026-08-21 (Phase 0 of the functionalization plan).

## Production runtime facts (verified)

| Item | Value |
|------|-------|
| Code tree | `/var/www/auctorio` (`/var/www/content-ai-platform` is a symlink to it) |
| Node / npm | v22.21.0 / 10.9.4 |
| DB | PostgreSQL `content_ai_platform` at `localhost:5432`, Prisma migrations up to date |
| Redis | valkey, `redis-cli ping` → PONG |
| API | `content-ai-api.service`, `127.0.0.1:4401`, env `/etc/content-ai-platform/app.env` |
| Studio SSR | `content-ai-studio.service`, `127.0.0.1:4400`, env `/etc/content-ai-platform/studio.env` |
| Workers | text, image, scraping, publishing — all running, queue names `queue_*` |
| Public | `https://auctorio.com` → Studio SSR (`/`), API (`/v1/`, `/v2/`), assets (`/assets/`) |
| Nginx | `/etc/nginx/sites-enabled/content-ai-platform.conf` |

## Environment variable matrix

Key: `●` set in production env, `—` not set (code default applies), `mock` = dev-only provider.

| Variable | Required | Component | Dev | Production |
|----------|----------|-----------|-----|------------|
| `NODE_ENV` | yes | all | `development` | ● `production` |
| `APP_ENV` | yes | all | `local` | ● `production` |
| `HOST` / `PORT` | yes | api | `0.0.0.0:3000` | `4401` (api), `4400` (studio) |
| `PUBLIC_BASE_URL` | yes | api | `http://localhost:3000` | ● `https://auctorio.com` |
| `DATABASE_URL` | yes | api/workers | local | ● |
| `REDIS_URL` | yes | api/workers | local | ● |
| `LOG_LEVEL` | no | all | `info` | ● `info` |
| `TEXT_PROVIDER` | yes | worker-text | `deepseek` | ● `deepseek` |
| `TEXT_API_BASE_URL` | yes | worker-text | `https://api.deepseek.com` | ● |
| `TEXT_API_KEY` | yes | worker-text | — | ● (fail-fast if missing) |
| `TEXT_MODEL` | yes | worker-text | `deepseek-chat` | ● |
| `TEXT_TEMPERATURE/MAX_TOKENS/TIMEOUT_MS/RETRIES` | no | worker-text | defaults | — (defaults) |
| `TEXT_COST_PER_1K_*` | no | worker-text | `0` | — |
| `IMAGE_PROVIDER` | yes | worker-image | `siliconflow` | ● `siliconflow` |
| `IMAGE_API_BASE_URL` | yes | worker-image | `https://api.siliconflow.com` | ● |
| `IMAGE_API_KEY` | yes | worker-image | — | ● (fail-fast if missing) |
| `IMAGE_MODEL` | yes | worker-image | `black-forest-labs/FLUX.2-pro` | ● |
| `IMAGE_TIMEOUT_MS/RETRIES` | no | worker-image | defaults | ● 90000/1 |
| `IMAGE_DOWNLOAD_TIMEOUT_MS/RETRIES` | no | worker-image | defaults | ● 90000/1 |
| `IMAGE_COST_PER_GEN_USD` | no | worker-image | `0` | — |
| `STORAGE_ROOT` | yes | api/worker-image | repo storage | ● `/var/www/content-ai-platform/storage` |
| `PUBLISH_TIMEOUT_MS` | no | worker-publishing | `30000` | ● `30000` |
| `PUBLISH_DRY_RUN` | yes | worker-publishing | `true` (dev default) | ● `false` |
| `GUIATV_AUCTORIO_ADMIN_KEY` | site-scoped | worker-publishing | — | ● (publish fails loudly if missing) |
| `TECNORIA_AUCTORIO_TOKEN` / `TALKARIS_AUCTORIO_TOKEN` | site-scoped | worker-publishing | — | ● |
| `STUDIO_*` (session, cookie, allowed hosts) | yes | studio SSR | `.env.example` defaults | ● via `studio.env` |
| `GOOGLE_CLIENT_ID` | optional | studio auth | — | ● |
| `SMTP_*` | optional | studio email | — | ● |
| `SILICONFLOW_*` (legacy MCP vars) | no | none (unused by API) | — | — |

## Fail-fast rules (implemented 2026-08-21)

1. `TEXT_PROVIDER=mock` or missing provider config **throws at worker startup in production** (no mock output).
2. `IMAGE_PROVIDER=mock` or missing provider config **throws at worker startup in production** (no 1×1 placeholder).
3. Publishing with missing site credentials in production **throws `publishing_missing_credentials`** and fails the publication job; the non-production dry-run fallback remains for local development only.
4. `PUBLISH_DRY_RUN` defaults to enabled unless `APP_ENV` and `NODE_ENV` are both `production` (unchanged; operator override still possible via explicit env).

## Migration verification (2026-08-21)

- Empty DB → `prisma migrate deploy` → 27 tables, up to date. ✔
- Production DB → `prisma migrate status` → up to date. ✔
- Scratch DB used for the empty test was dropped afterwards.

## Deployment reproducibility

- All six systemd units are versioned under `infra/systemd/` and match the live units in `/etc/systemd/system/`.
- Studio deploys via `/var/www/bin/deploy-auctorio-studio.sh` (release symlink + `content-ai-studio.service` restart).
- Nginx site config: `/etc/nginx/sites-enabled/content-ai-platform.conf` (HTTPS only, `/v2/` + `/assets/` + `/` → SSR).
