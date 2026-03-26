# AUCTORIO REBUILD STATUS

## Current objective

Auditar y abrir foundations reales de social publishing, empezando por Instagram y con extension posterior a LinkedIn, revisando `orchestration`, `prompts`, `routes` y las surfaces que hoy solo muestran seeds o hints parciales.

## Current phase

- Pass: 16
- Phase: 2 — Visual System and UX Foundation
- Subphase: P0 scheduled rollout and route budget control

## Completed in latest pass

- Releido el estado persistido de la Pass 15 y revisado otra vez el mandato original para confirmar que el siguiente bloque correcto seguia siendo `scheduled` junto con budget control real sobre rutas.
- Rehecho `ScheduledPage` sobre la foundation shared: header premium, stat strip, hero de release posture, watchlist de ready/retry/runtime y lectura de release management basada en `reviewGate` y publication jobs.
- Sustituido el header/stat manual de `scheduled` por shared primitives y eliminado `DatePipe` del page chunk para mantener la disciplina de peso.
- Convertido `StudioShellComponent` y `PublicShellComponent` a lazy routes desde `app.routes.ts`; el cambio reduce de forma material el `initial bundle` sin alterar guards ni SSR.
- Validado tipado, build del Studio, build TypeScript del repo y tests SSR/rutas relevantes; esta pasada cierra el warning de budget y deja el bundle inicial en `443.48 kB`.
- Reauditada la base real de social publishing: hoy existen prompts, seeds y hints parciales para Instagram, pero no un flujo social operativo de producto.

## Files touched

- `apps/studio-web/src/app/pages/scheduled-page.component.ts`
- `apps/studio-web/src/app/app.routes.ts`
- `docs/auctorio-master-roadmap.md`
- `docs/auctorio-rebuild-status.md`

## Architecture decisions

- La foundation visual sigue extendiendose sobre el sistema `console-*` y sobre shared components muy pequeños, no sobre una segunda biblioteca de UI.
- `studio-page-header`, `studio-stat-strip` y `studio-side-panel` quedan confirmados tambien para `scheduled`; release management entra por fin en el mismo lenguaje shared.
- `ScheduledPage` puede exponer ready lane, retry lane e incidentes runtime sin nueva API; `reviewGate` y publication jobs ya dan señal suficiente.
- El budget inicial no dependia de `scheduled`, sino de shells eager en `app.routes.ts`; lazy-loadear `StudioShellComponent` y `PublicShellComponent` es una palanca valida y compatible con guards/SSR.
- No se introduce ningun cambio funcional en backend para esta pasada; el trabajo es de composicion visual, shared primitives, coherencia operacional y UX.
- La disciplina de no añadir CSS nueva vuelve a sostenerse en una pasada adicional y el budget inicial deja de ser warning activo; eso queda ya como decision operativa explicita de Phase 2.

## UX/UI decisions

- `Scheduled` deja de sentirse como cola de botones y pasa a resumir el handoff final entre approval, runtime, retry y publish.
- Release management ya enseña ready lane, retry lane e incidentes runtime con una narrativa mas honesta de operación.
- La base premium se sigue extendiendo sin tocar backend ni reabrir deuda semantica ya cerrada en Passes 1 a 8.
- El siguiente paso de producto ya no es visual sino funcional: separar verdad social operativa de prompts/seeds parciales y abrir un flujo real para Instagram primero.

## Functional status by module

### Backend API

- Operativo: `projects list/detail` siguen exponiendo `reviewGate` y metrics enriquecidas.
- Estable: no ha sido necesario tocar backend en esta pasada; el cambio era de composicion visual, shared primitives y UX.
- Gap: el contrato backend sigue siendo suficiente para el cockpit actual, pero todavia no existe una capa analitica dedicada ni scorecards persistidas.

### QA / Review

- Mejorado: `QA Queue`, `Dashboard`, `Pipeline`, `Projects`, `Text Generation`, `Image Generation`, `Media Library`, `Calendar`, `Automation` y `Analytics` ya describen el riesgo y la readiness desde el mismo gate.
- Mejorado: `version-compare` ya comunica delta editorial y readiness con una narrativa mas propia de un cockpit que de una vista tecnica de diff.
- Parcial: el scoring sigue siendo derivado y basico; aun no hay taxonomia editorial enriquecida ni persistida.

### Publishing

- Mejorado: reporting, scheduling y automation ya distinguen piezas listas, colas runtime, retries y blockers sin colapsarlo todo en enums legacy.
- Mejorado: `publishing history`, `destinations` y `scheduled` ya sostienen una capa de governance mas cercana a un cockpit enterprise y no solo a tablas/formularios tecnicos.
- Parcial: sigue faltando profundizar en scheduling avanzado real, no solo en la surface de release management.

### Studio Angular

- Mejorado: `studio-shell`, `dashboard`, `projects`, shared header/stat components, `project detail`, `editor-review`, `editorial-versions`, `publishing history`, `destinations`, `qa-queue`, `version-compare`, `workspace settings`, `prompt library`, `users`, `roles` y `scheduled` ya sostienen una base visual claramente mas consistente.
- Parcial: quedan algunas surfaces secundarias por debajo, pero la deuda premium principal del cockpit ya no está en las vistas core.

### Workspace governance

- Mejorado: `workspace settings`, `users` y `roles` ya se leen como una capa coherente de gobierno del tenant y no como utilidades sueltas.
- Parcial: el siguiente salto ya no es de workspace governance, sino de expansion funcional a social publishing real.

### Prompt governance

- Mejorado: `prompt-library` ya expone approval backlog, assignment coverage y preview source con una lectura mas cercana a control plane.
- Parcial: el subsistema sigue necesitando trazabilidad mas profunda entre preset activo, output generado y adopcion real por site/destination.

## Pending critical issues

- La foundation visual premium ya cubre las surfaces core del Studio; la deuda principal deja de ser visual y pasa a ser funcional en social publishing y scorecards editoriales mas profundas.
- El score QA sigue siendo suficiente para MVP, pero aun no es una scorecard enterprise completa.
- No existe pipeline social real para Instagram ni LinkedIn.
- Aunque el budget warning se cierra, conviene vigilar el crecimiento de shells y rutas lazy para no reabrir el problema en siguientes pasadas.

## Next pass starting point

1. Partir de `src/studio/orchestration.ts`, `src/studio/prompts.ts` y `src/studio/routes.ts`.
2. Auditar en paralelo `src/application/services/prompt.ts`, `src/domain/entities/index.ts` y `apps/studio-web/src/app/pages/project-detail-page.component.ts` en la zona de outputs sociales.
3. Objetivo exacto: separar lo que hoy es seed o scaffold social de lo que puede convertirse en flujo real de Instagram first, con arquitectura honesta y extensible a LinkedIn despues.

## Validation results

- `npm run typecheck` ✅
- `npm run build:studio` ✅
- `npm run build` ✅
- `node --test dist/tests/studio-routes.test.js dist/tests/studio-ssr.test.js` ✅
- Nota: `build:studio` ya no muestra warning de budget inicial; el total cae a `443.48 kB`, muy por debajo del limite de `500 kB`.
- Nota adicional: la suite SSR/rutas paso completa tras el lazy loading de shells, sin regressions visibles de guards o login flow.

## Known risks

- La coherencia semantica del core editorial sigue alta y la perception premium del cockpit principal ya es bastante uniforme.
- El score QA es util para operar, pero todavia no cubre profundidad semantica ni checklist editorial avanzada.
- La experiencia social sigue siendo solo fundacional y puede inducir expectativas si se expone demasiado pronto; ese es ya el siguiente gap de producto mas visible.
- El rebuild sigue ocurriendo sobre un worktree con cambios previos no relacionados; no se han revertido.
