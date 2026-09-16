# Auctorio quality gates

Required gates are evidence-based and ordered by dependency:

1. `npm run typecheck`
2. `npm run build`
3. `npm run build:studio`
4. `npx prisma migrate deploy` against an isolated test database
5. `npm test` with PostgreSQL and Redis/Valkey available
6. `npm run test:e2e` with its documented browser and server prerequisites
7. `npm audit --omit=dev` with no critical production vulnerability
8. secret scan over tracked content without recording secret values

Each result is recorded as `PASS`, `FAIL`, or `BLOCKED` with the exact command,
prerequisite, and observed result. A build passing does not imply production
readiness; deployment, rollback, observability, provider credentials, and
staging evidence remain separate gates.
