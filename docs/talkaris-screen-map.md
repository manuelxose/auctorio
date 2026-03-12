# Talkaris Screen Map

## Estado de pantallas del cockpit editorial

Actualizado: marzo 2026

| Route | Screen | Purpose | Data source | Status |
| --- | --- | --- | --- | --- |
| `/studio/dashboard` | Editorial Cockpit | Vista ejecutiva con KPIs, pipeline health, readiness, publishing reciente | `session`, `sites`, `projects`, `publications` | Live |
| `/studio/projects` | Projects | Registro maestro de iniciativas editoriales y su estado | `projects` | Live |
| `/studio/projects/new` | Create Project | Alta de nuevas piezas con brief y destino principal | `sites` | Live |
| `/studio/projects/:id` | Project Detail | Control operativo fino: brief, versiones, QA, publishing | `project detail` | Live |
| `/studio/editorial/pipeline` | Pipeline | Flujo editorial desde brief hasta publish | `projects` | Live |
| `/studio/editorial/calendar` | Calendar | Agenda operativa y próximas salidas | `projects`, `publications` | Live |
| `/studio/editorial/briefs` | Briefs | Entrada editorial y readiness de contenido | `projects` | Live |
| `/studio/editorial/articles` | Articles | Producción, QA y publishing readiness | `projects`, `versions` | Live |
| `/studio/editorial/versions` | Versions | Comparación y memoria de iteraciones | `projects`, `versions` | Live |
| `/studio/assets/images` | Images | Cobertura visual y generación de heroes | `assets` | Live |
| `/studio/assets/library` | Media Library | Inventario de variantes y assets publicados | `assets` | Live |
| `/studio/ai/text-generation` | Text Generation | Runs y reruns conectados al workflow editorial | `projects` | Live |
| `/studio/ai/image-generation` | Image Generation | Generación visual y trazabilidad de prompts | `assets` | Live |
| `/studio/ai/prompts` | Prompt Library | Presets, versiones, asignaciones y governance | `promptPresets`, `promptVersions` | Live |
| `/studio/review/qa` | QA Queue | Triage de fallos, validación y release blockers | `projects` | Live |
| `/studio/review/editor` | Editor Review | Aprobación humana y handoff a publishing | `projects` | Live |
| `/studio/publishing/destinations` | Destinations | Destinos conectados y readiness de publicación | `sites` | Live |
| `/studio/publishing/scheduled` | Scheduled | Release queue y draft sync | `publications` | Live |
| `/studio/publishing/history` | History | Historial de publicaciones y retiros | `publications` | Live |
| `/studio/analytics/content-performance` | Content Performance | Throughput editorial y rendimiento multi-site | `projects`, `publications`, `sites` | Live |
| `/studio/analytics/seo-metrics` | SEO Metrics | Readiness SEO y oportunidades de optimización | `projects`, `sites` | Live |
| `/studio/automation/pipelines` | Automation Pipelines | Automatización de handoffs y reglas operativas | `jobs` | Live |
| `/studio/automation/jobs` | Automation Jobs | Colas, ejecuciones y fallos del runtime | `jobs` | Live |
| `/studio/integrations/cms` | CMS Integrations | Adapters y contratos de publicación | `sites` | Live |
| `/studio/integrations/webhooks` | Webhooks | Delivery y delivery failures | `sites` | Live |
| `/studio/integrations/apis` | APIs | Superficies programáticas del cockpit | `sites` | Live |
| `/studio/settings/workspace` | Workspace Settings | SSO, provisioning y señales base del tenant | `session`, `identityProvider` | Live |
| `/studio/settings/users` | Users | Invitaciones, estados y ownership del equipo | `users`, `roles` | Live |
| `/studio/settings/roles` | Roles | RBAC y matriz de permisos del workspace | `roles` | Live |
| `/studio/login` | Login | Autenticación por API key o SSO | auth endpoints | Live |

## Rutas legacy y redirects

| Legacy route | Redirect target |
| --- | --- |
| `/studio` | `/studio/dashboard` |
| `/studio/bots` | `/studio/projects` |
| `/studio/bots/create` | `/studio/projects/new` |
| `/studio/conversations/live` | `/studio/review/qa` |
| `/studio/conversations/history` | `/studio/review/editor` |
| `/studio/conversations/search` | `/studio/editorial/pipeline` |
| `/studio/knowledge/**` | `/studio/editorial/briefs` |
| `/studio/channels/**` | `/studio/integrations/cms` |
| `/studio/deployments` | `/studio/publishing/history` |
| `/studio/logs` | `/studio/automation/jobs` |
| `/studio/users/**` | `/studio/settings/users` |
| `/studio/developers/**` | `/studio/integrations/apis` |
| `/studio/sites` | `/studio/publishing/destinations` |

## Mapa de navegación

### Dashboard
- Overview

### Operations
- Projects (All Projects, Create Project)
- Editorial (Pipeline, Calendar, Briefs, Articles, Versions)
- Assets (Images, Media Library)
- AI Generation (Text Generation, Image Generation, Prompt Library)

### Control
- Review (QA Queue, Editor Review)
- Publishing (Destinations, Scheduled, History)
- Analytics (Content Performance, SEO Metrics)
- Automation (Pipelines, Jobs)
- Integrations (CMS, Webhooks, APIs)

### Governance
- Settings (Workspace, Users, Roles)

## Protección por permisos

Items de navegación filtrados por RBAC:

| Permission | Surfaces gated |
| --- | --- |
| `projects.manage` | Create Project |
| `prompts.manage` | Prompt Library |
| `analytics.read` | Content Performance, SEO Metrics |
| `integrations.manage` | CMS, Webhooks, APIs |
| `users.manage` | Users |
| `roles.manage` | Roles |
| `review.approve` | QA Queue (dashboard action) |
| `publishing.manage` | Destinations (dashboard action) |

## Lectura del mapa

Este screen map refleja la arquitectura actual del cockpit editorial:

- todas las pantallas son componentes reales con datos vivos — no hay placeholders
- la navegación es permission-aware: items se ocultan si el usuario no tiene el permiso requerido
- los redirects de rutas legacy preservan compatibilidad con URLs antiguas del modelo conversacional
- el sistema de roles (Owner, Admin, custom) gobierna acceso a governance y operaciones sensibles
