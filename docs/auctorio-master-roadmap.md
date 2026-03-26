# AUCTORIO MASTER ROADMAP

## Vision

Auctorio debe consolidarse como un cockpit editorial SaaS multi-tenant para content operations con IA, centrado primero en dos flujos de negocio reales:

1. Publicacion SEO de articulos en webs.
2. Preparacion y publicacion social, empezando por Instagram y despues LinkedIn.

La plataforma no debe sentirse como un CMS clasico ni como una demo de IA. Debe operar briefs, generaciones, QA, aprobaciones, assets y publishing multi-destino desde una superficie coherente, premium y vendible.

## Product scope for the rebuild

### Core now

- Workspaces multi-tenant con destinos y permisos.
- Proyectos editoriales con briefs, versiones, QA, aprobacion y publishing.
- Publicacion web real con adapters y trazabilidad.
- Studio Angular SSR coherente y utilizable.

### Later, only after the core is solid

- Social publishing operativo con diferencias honestas entre automatico y asistido.
- Calendar, scheduling avanzado y automation secundaria.
- Reporting y analytics editoriales profundas.

## Priorities

### P0

- Reforzar el flujo real `project -> generation -> QA -> approval -> publish`.
- Eliminar friccion del brief plano y el detalle casi de solo lectura.
- Convertir versions, compare y review en un gate editorial real sobre datos vivos.
- Consolidar QA queue, project detail y publish entry points sobre el mismo gate.
- Propagar el mismo gate a dashboard, pipeline y superficies agregadas restantes.
- Llevar el mismo gate a `projects list`, `text generation` y demas colecciones que aun venden readiness desde enums legacy.
- Llevar el mismo gate y la logica de image readiness a `image generation` y `media library`, porque el hero visual forma parte del flujo SEO real antes de QA/publish.
- Llevar el mismo gate a `editorial-calendar` y `automation-pipelines`, porque planning y orchestration no pueden seguir narrando otra realidad distinta a la del release real.
- Llevar el mismo gate a `analytics` y limpiar el lenguaje residual de `project.status` en las ultimas superficies agregadas, para que reporting y cockpit no vuelvan a divergir.
- Una vez cerrada esa coherencia semantica, abrir la Phase 2 con una base visual shared para el Studio: shell, tokens, layouts, tables, cards y toolbars premium.
- Aplicar primero esa foundation visual a `studio-shell`, `dashboard`, `projects` y despues a `project detail` y shared components antes de abrir una pasada de polish mas amplia.
- Despues de eso, extender la misma foundation a `editor-review` y `editorial-versions`, combinandola ya con una pasada disciplinada de control de bundle.
- A continuacion, extender la foundation a `publishing history` y `destinations`, porque governance de release es la siguiente capa visible del cockpit enterprise.
- Despues de publishing governance, cerrar `qa-queue` y `version-compare` como superficies criticas del core editorial y abrir control de bundle sobre las rutas lazy mas pesadas.
- Despues de QA y compare, extender la foundation a `workspace-settings` y `prompt-library`, auditando en paralelo `users` y `roles` para cerrar el siguiente bloque de gobierno del workspace.
- Despues de settings y prompt governance, extender la foundation a `users` y `roles`, manteniendo abierto el control de bundle sobre rutas lazy de alto trafico y superficies shared ya reforzadas.
- Despues de users y roles, cerrar `scheduled` como la principal surface visual pendiente de release management y ejecutar una pasada explicita de budget control sobre bundle inicial, `angular.json`, `app.routes.ts` y rutas lazy/shared de mayor peso.
- Despues de `scheduled` y del cierre del budget warning, reauditar la base real de social publishing y abrir foundations honestas para Instagram first y LinkedIn despues, sin vender automatizacion inexistente.
- Alinear Studio, BFF y backend con el lenguaje editorial real.
- Mantener publishing web, auth y multi-tenant estables mientras se reestructura UX.

### P1

- Visual system premium y consistente a escala Studio.
- Version compare, review inbox, publishing history mas fuerte y destinations mas operativas.
- Prompt library conectada claramente con la generacion real.
- Capa SaaS de users, roles, identity provider y workspace governance cerrada.

### P2

- Social publishing de Instagram y LinkedIn con modelo, validaciones y estados honestos.
- Marketing site SSR premium.
- Hardening, observabilidad y tests ampliados.

## Acceptance criteria by phase

## Phase 1 — Audit and Product Rebase

### Objective

Separar verdad operativa de scaffolding y redefinir el producto ejecutable.

### Acceptance criteria

- Inventario real de rutas, endpoints, entidades, workers, adapters y auth.
- Clasificacion explicita: operativo, parcial, mock, roto, obsoleto.
- Backlog P0/P1/P2 priorizado por impacto.
- Memoria persistente de estado creada y actualizada en cada pasada.

## Phase 2 — Visual System and UX Foundation

### Objective

Unificar lenguaje visual, layouts y patrones del Studio.

### Acceptance criteria

- Tokens, spacing, densidades y estados consistentes.
- Navegacion clara, enterprise y editorial-tech.
- Formularios, tablas, vacios, loaders y banners coherentes.
- Desktop prioritario con responsive usable en tablet y mobile.

## Phase 3 — Editorial Core

### Objective

Hacer serio y utilizable el flujo editorial principal.

### Acceptance criteria

- Crear proyecto real con brief usable.
- Generar contenido real.
- Revisar, versionar y comparar.
- Aprobar y publicar a web real o a dry-run verificable.

## Phase 4 — QA and Review

### Objective

Convertir QA y review en una capa real de decision editorial.

### Acceptance criteria

- Score QA entendible.
- Errores y warnings claros.
- Version diff legible.
- Bloqueo de publish si faltan minimos.

## Phase 5 — Social Publishing

### Objective

Extender Auctorio al contenido social sin vender humo funcional.

### Acceptance criteria

- Entidad o modelo operativo para piezas sociales.
- Preparacion por canal y validaciones de assets.
- Flujo de review, approval y publish o manual assist.
- Historial y estados por canal.

## Phase 6 — Workspace, Users, Roles, Destinations

### Objective

Cerrar la base SaaS multi-tenant y de gobierno.

### Acceptance criteria

- Roles y permisos coherentes.
- Users y workspace settings operativos.
- Destinations con salud, credenciales y dry-run claros.

## Phase 7 — Prompt Library

### Objective

Gobernar la generacion real con presets versionados y trazables.

### Acceptance criteria

- Draft, approved, deprecated.
- Asignacion por site o scope global.
- Preview contextual.
- Relacion visible entre prompt activo y output generado.

## Phase 8 — Marketing Site SSR

### Objective

Vender el producto con una presencia publica a la altura del Studio.

### Acceptance criteria

- EN/ES, sitemap, robots y copy SEO.
- Posicionamiento claro y coherente con el producto real.
- Calidad visual premium.

## Phase 9 — Hardening and Tests

### Objective

Dejar la base seria para demos, uso real y evolucion.

### Acceptance criteria

- Tests de prompts, QA, publishing, SSR/BFF y rutas criticas.
- Workers y adapters con cobertura minima suficiente.
- Riesgos operativos documentados y monitoreables.

## Current execution order

1. Cerrar Phase 1 con auditoria viva y backlog estabilizado.
2. Encadenar mejoras P0 directamente sobre el flujo editorial real.
3. Cerrar primero intake + review gate + QA/publish entry points antes de abrir social publishing.
4. No abrir social publishing real hasta que el flujo SEO web sea consistente end-to-end.

## Latest progress snapshot

- Pass 1 cerrado: intake editorial estructurado y editable.
- Pass 2 cerrado: review gate, compare legible y surfaces de review/versions basadas en datos vivos.
- Pass 3 cerrado: scorecard QA, project detail y publish entry points alineados con `reviewGate`.
- Pass 4 cerrado: dashboard y pipeline ya operan sobre `reviewGate` y no sobre status legacy como verdad principal.
- Pass 5 cerrado: `projects list` y `text generation` ya operan sobre `reviewGate`; generation usa `revise` solo cuando existe feedback real y blockers reales cuando no.
- Pass 6 cerrado: `image generation` y `media library` ya operan sobre `reviewGate` y priorizan gaps visuales por impacto real en QA/approval/publish.
- Pass 7 cerrado: `editorial-calendar` y `automation-pipelines` ya operan sobre `reviewGate` y publication jobs reales para distinguir planning, runtime y blockers honestos.
- Pass 8 cerrado: `analytics` ya opera sobre `reviewGate`, latest version package y publication jobs; ademas se limpio el lenguaje residual de `project.status` en surfaces secundarias del Studio.
- Pass 9 cerrado: arranque de Phase 2 con foundations visuales shared en `styles.css`, `studio-shell`, `dashboard` y `projects`.
- Pass 10 cerrado: la foundation visual ya alcanza `project detail` y shared components (`studio-page-header`, `studio-stat-strip`).
- Pass 11 cerrado: la foundation visual ya alcanza `editor-review` y `editorial-versions`, ademas de consolidar la semantica de `reviewGate` desde helpers shared en lugar de mapas locales por pantalla.
- Pass 12 cerrado: la foundation visual ya alcanza `publishing history` y `destinations`, corrigiendo ademas el handoff para apuntar a los componentes reales (`deployments-page` y `sites-page`) en vez de nombres asumidos.
- Pass 13 cerrado: la foundation visual ya alcanza `qa-queue` y `version-compare`, reutilizando shared primitives y manteniendo el bundle inicial estable en `514.10 kB`.
- Pass 14 cerrado: la foundation visual ya alcanza `workspace settings` y `prompt-library`, reforzando gobierno del tenant y del runtime de prompts sin anadir CSS nueva ni empeorar el bundle inicial.
- Pass 15 cerrado: la foundation visual ya alcanza `users` y `roles`, cerrando el bloque principal de gobierno del workspace sin tocar backend ni anadir CSS nueva, y reduciendo el bundle inicial a `512.74 kB`.
- Pass 16 cerrado: la foundation visual ya alcanza `scheduled` y el budget warning del bundle inicial queda resuelto al lazy-loadear shells desde `app.routes.ts`, dejando el total en `443.48 kB`.
- Siguiente foco: reauditar la base social real (`orchestration`, `prompts`, `routes`, surfaces con outputs sociales) y abrir un flujo honesto de Instagram first extensible a LinkedIn.
