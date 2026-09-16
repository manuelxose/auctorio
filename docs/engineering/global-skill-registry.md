# Global skill registry

The registry is intentionally descriptive. Skill implementations and provider
configuration remain in the user-scoped Codex/GSD installation.

| Skill family | Responsibility | Trigger/surface | Status |
| --- | --- | --- | --- |
| GSD Pi | milestone, planning, execution, verification, recovery | native `gsd` workflow | validated |
| Graphify | code-impact and relationship context | `graphify query/path/explain` | query validated; refresh blocked by cache guard |
| Context Mode | focused local context and indexed evidence | bundled doctor/index/search | validated |
| Ponytail | minimal implementation and dependency discipline | engineering task review | applied |
| TypeScript/Node | type safety and runtime conventions | source/tests/toolchain | validated by typecheck/build |
| Prisma/database | schema, migrations, tenant-scoped persistence | migration and DB test gates | validated by full suite |
| Angular/SSR | Studio build and browser surface | nested Studio lockfile/build | validated by Studio build and SSR tests |
| Playwright | browser smoke and E2E validation | project-local `npm run test:e2e` | local Chromium smoke validated; live E2E credential-gated |
| Security/QA | adversarial checks, secret hygiene, release gates | project quality contracts | audit gate recorded |
