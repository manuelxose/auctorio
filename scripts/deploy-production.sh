#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="${APP_ROOT:-/var/www/content-ai-platform}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4401/health/live}"
SERVICES=(content-ai-api content-ai-studio content-ai-worker-discovery content-ai-worker-scraping content-ai-worker-text content-ai-worker-image content-ai-worker-automation content-ai-worker-publishing content-ai-worker-scheduler content-ai-worker-social content-ai-worker-connection)
cd "$APP_ROOT"
npm ci
npx prisma migrate deploy
npm run build
npm run build:studio
/var/www/bin/deploy-auctorio-studio.sh
systemctl restart "${SERVICES[@]}"
sleep 3
curl --fail --silent --show-error "$HEALTH_URL" >/dev/null
for service in "${SERVICES[@]}"; do systemctl is-active --quiet "$service.service"; done
echo "Deployment verified: $(git rev-parse --short HEAD)"
