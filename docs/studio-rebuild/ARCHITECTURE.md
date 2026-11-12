# Studio rebuild — architecture

Branch `fix/deploy-ref-and-health` (base commit `38146de`). Not committed yet. Nothing deployed.

## Stack (verified)

- Studio: Angular 20 SSR (`apps/studio-web`). Express SSR server signs Studio requests and proxies `/studio/api/backend/*` to the API.
- API: Fastify + Prisma/PostgreSQL + Redis/BullMQ (`src/`). Studio context arrives as HMAC-signed headers (`readSignedStudioContext`); tenant is the access boundary, sites belong to tenants.
- AI: `getTextProvider()` (`src/infrastructure/ai/text.ts`), any OpenAI-compatible endpoint chosen by `TEXT_PROVIDER/TEXT_API_*`. The copilot reuses it; no new model routing.

## What was added

| Layer | File | Responsibility |
|---|---|---|
| Shell | `apps/studio-web/src/app/layout/app-shell.component.ts` | Top bar (Navigation A), sidebar (Navigation B), copilot column, palette, shortcuts, layout persistence |
| Nav model | `layout/studio-nav.ts` | Single source for sidebar groups, active-item matching, palette entries |
| Palette | `layout/command-palette.component.ts` | Ctrl/⌘K go-to and actions |
| Copilot UI | `components/copilot/copilot-panel.component.ts` | Threads, history search, composer, states, evidence, suggestions |
| Copilot client | `services/copilot.service.ts` | Server-backed state; attaches route, active site and open article |
| Markdown | `utils/copilot-markdown.ts` (+ spec) | Escape-first renderer, Studio-only links |
| Competencies page | `pages/competencies-page.component.ts`, route `/studio/competencies` | Registry, permissions, real run history |
| API | `src/studio/routes-copilot.ts` | `/v2/copilot/*` endpoints, user-session only |
| Service | `src/studio/copilot/copilot.ts` | Context validation, threads, generation, retry, cancel, audit |
| Registry | `src/studio/copilot/competencies.ts` (+ `tests/copilot-competencies.test.ts`) | Declarative read-only competencies |
| Data | `prisma/schema.prisma`, migration `20261111120000_studio_copilot` | `copilot_threads`, `copilot_messages` |
| Proxy | `apps/studio-web/src/server.ts` | Drops the upstream call when the browser disconnects (real cancellation) |

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/v2/copilot/competencies` | Registry + `allowed` per caller role + aggregated run stats |
| GET | `/v2/copilot/runs?key&limit` | Caller's competency runs |
| GET | `/v2/copilot/threads?q` | Caller's threads, searchable by title/content |
| GET/DELETE | `/v2/copilot/threads/:id` | Owner only (404 otherwise) |
| POST | `/v2/copilot/messages` | `{ threadId?, content, competencyKey?, context: { siteId?, projectId?, route? } }` |
| POST | `/v2/copilot/messages/:id/retry` | Regenerates a failed/cancelled answer in place |

Unsigned or forged requests get 401; API-key (machine) access gets 403.
