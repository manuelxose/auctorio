#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update
sudo apt-get install -y build-essential curl git ca-certificates postgresql valkey-server
if [[ ! -s "$HOME/.nvm/nvm.sh" ]]; then curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash; fi
source "$HOME/.nvm/nvm.sh"
nvm install 22
nvm alias default 22
nvm use 22
git config --global core.autocrlf input
npm ci
cp -n .env.example .env || true
sed -i 's/^APP_ENV=.*/APP_ENV=local/; s/^NODE_ENV=.*/NODE_ENV=development/; s#^DATABASE_URL=.*#DATABASE_URL=postgresql://auctorio:auctorio@localhost:5432/content_ai#; s#^REDIS_URL=.*#REDIS_URL=redis://localhost:6379#; s/^PUBLISH_DRY_RUN=.*/PUBLISH_DRY_RUN=true/' .env
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='auctorio'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER auctorio PASSWORD 'auctorio'"
sudo -u postgres createdb -O auctorio content_ai 2>/dev/null || true
npx prisma migrate deploy
npm run typecheck
echo 'WSL development environment ready.'
