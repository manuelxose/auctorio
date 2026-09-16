# Acceptance scenarios

- A fresh checkout installs the root lockfile and the nested Studio lockfile.
- TypeScript and Angular builds complete without placeholder code or type
  suppression.
- Image storage remains inside `STORAGE_ROOT`, is tenant-scoped, and produces
  the documented WebP derivatives.
- Database-backed tests run against PostgreSQL with migrations applied, and
  queue tests use an available Redis/Valkey endpoint.
- Unauthenticated Studio requests redirect to canonical login; legacy login
  paths do not expose a private page.
- Tenant, site, provider, upload, feed, and publication failures remain
  visible and do not cross trust boundaries.
