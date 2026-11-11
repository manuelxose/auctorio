#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="${APP_ROOT:-/var/www/content-ai-platform}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4401/health/live}"
# The automation service is now the single control plane (planner + scheduler
# + watchdog). Queue consumers remain isolated by workload.
SERVICES=(content-ai-api content-ai-studio content-ai-worker-discovery content-ai-worker-scraping content-ai-worker-text content-ai-worker-image content-ai-worker-automation content-ai-worker-publishing content-ai-worker-social content-ai-worker-connection)
cd "$APP_ROOT"
npm ci
npm ci --prefix apps/studio-web --ignore-scripts
npx prisma migrate deploy
npm run build
npm run build:studio
/var/www/bin/deploy-auctorio-studio.sh
systemctl disable --now content-ai-worker-scheduler.service 2>/dev/null || true
systemctl restart "${SERVICES[@]}"
# The API needs more than a few seconds after a full restart; retry for up to ~60s instead of a fixed sleep.
curl --fail --silent --show-error --retry 30 --retry-delay 2 --retry-connrefused "$HEALTH_URL" >/dev/null
for service in "${SERVICES[@]}"; do systemctl is-active --quiet "$service.service"; done
echo "Deployment verified: $(git rev-parse --short HEAD)"
