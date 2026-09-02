#!/usr/bin/env bash
set -euo pipefail
npm run typecheck
npx prisma validate
npm run build
npm run build:studio
npm test
