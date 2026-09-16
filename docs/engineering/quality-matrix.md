# Quality matrix

| Gate | Command/evidence | Current result |
| --- | --- | --- |
| Type safety | `npm run typecheck` | PASS |
| Backend build | `npm run build` | PASS |
| Studio build | `npm run build:studio` after nested `npm ci` | PASS; existing Angular warnings remain |
| Migrations | `npx prisma migrate deploy` against local PostgreSQL | PASS; no pending migrations |
| Unit/integration suite | `npm test` with PostgreSQL and Redis/Valkey | PASS; 378/378 |
| Production dependency criticals | `npm audit --omit=dev --audit-level=critical` | PASS; no critical findings, six major-fix findings remain |
| Live E2E | `npm run test:e2e` | BLOCKED; requires explicit `E2E_EMAIL`/`E2E_PASSWORD` and a target |
| Graph refresh | `graphify update .` | BLOCKED; cache-version guard refused replacement |
