# Auctorio Screen Map

Fecha de definicion: 11 de marzo de 2026

## 1. Superficies auditadas hoy

| Ruta actual | Pantalla | Dominio real | Estado |
| --- | --- | --- | --- |
| `/studio/dashboard` | Dashboard | Resumen agregado de `sites`, `projects`, `publications` | Live |
| `/studio/channels/integrations` | Integrations | `Site` | Live |
| `/studio/deployments` | Deployments | `PublicationJob` | Live |
| `/studio/analytics/usage` | Analytics usage | agregados derivados | Live |
| `/studio/analytics/performance` | Analytics performance | agregados derivados | Live |
| `/studio/analytics/metrics` | Analytics metrics | agregados derivados | Live |
| `/studio/logs` | Logs | `PublicationJob` fallidos/queued | Live |
| `/studio/ops/projects` | Pipeline | `ContentProject` | Live |
| `/studio/ops/projects/:id` | Project detail | `ContentProject` + `ContentVersion` | Live |
| `/studio/bots/*` | Placeholder | no editorial | Planned |
| `/studio/conversations/*` | Placeholder | no editorial | Planned |
| `/studio/knowledge/*` | Placeholder | `Topic` y `Fact` existen, UI no | Hybrid |
| `/studio/ai/*` | Placeholder | prompt/provider/model parcial | Hybrid |
| `/studio/automation/*` | Placeholder | workers existen, UI no | Hybrid |
| `/studio/users/*` | Placeholder | sin entidad | Planned |
| `/studio/developers/*` | Placeholder | auth/webhook parcial | Hybrid |
| `/studio/settings/*` | Placeholder | tenant/sites parciales | Hybrid |

## 2. Mapa objetivo de rutas

### Dashboard

| Ruta propuesta | Pantalla | Prioridad | Fuente de datos |
| --- | --- | --- | --- |
| `/studio/dashboard` | Executive Dashboard | P0 | session, projects, publications, jobs, analytics |

### Projects

| Ruta propuesta | Pantalla | Prioridad | Fuente de datos |
| --- | --- | --- | --- |
| `/studio/projects` | All Projects | P0 | `ContentProject` |
| `/studio/projects/new` | Create Project | P0 | `Site`, templates |
| `/studio/projects/:projectId` | Project Overview | P0 | `ContentProject`, latest version, publications |

### Editorial

| Ruta propuesta | Pantalla | Prioridad | Fuente de datos |
| --- | --- | --- | --- |
| `/studio/editorial/pipeline` | Pipeline Board | P0 | projects + versions + qa + publications |
| `/studio/editorial/calendar` | Editorial Calendar | P1 | project dates, schedule metadata |
| `/studio/editorial/briefs` | Brief Registry | P1 | projects + brief schema |
| `/studio/editorial/briefs/:briefId` | Brief Editor | P0 | brief, facts, topic, cluster |
| `/studio/editorial/articles` | Article Registry | P1 | versions |
| `/studio/editorial/articles/:articleId` | Article Editor | P0 | version, qa, seo, assets |
| `/studio/editorial/versions` | Version Library | P1 | versions |
| `/studio/editorial/versions/:versionId` | Version Detail | P1 | version, derivatives, publication trace |
| `/studio/editorial/versions/:versionId/compare/:againstId` | Version Compare | P0 | two versions + diff metadata |

### Assets

| Ruta propuesta | Pantalla | Prioridad | Fuente de datos |
| --- | --- | --- | --- |
| `/studio/assets/images` | Image Generator | P0 | content images, jobs, ai audit |
| `/studio/assets/library` | Media Library | P1 | asset variants, content images |

### AI Generation

| Ruta propuesta | Pantalla | Prioridad | Fuente de datos |
| --- | --- | --- | --- |
| `/studio/ai/text-generation` | Text Generation Console | P0 | content text, ai audit, jobs |
| `/studio/ai/image-generation` | Image Generation Console | P0 | content image, ai audit, jobs |
| `/studio/ai/prompts` | Prompt Library | P1 | prompt templates, provider policies |

### Review

| Ruta propuesta | Pantalla | Prioridad | Fuente de datos |
| --- | --- | --- | --- |
| `/studio/review/qa` | QA Queue | P0 | qa reports, version states |
| `/studio/review/editor` | Editor Review | P1 | review assignments, comments, diffs |

### Publishing

| Ruta propuesta | Pantalla | Prioridad | Fuente de datos |
| --- | --- | --- | --- |
| `/studio/publishing/destinations` | Destinations | P0 | sites, credentials, publication health |
| `/studio/publishing/scheduled` | Scheduled Queue | P1 | future publication jobs |
| `/studio/publishing/history` | Publication History | P0 | publication jobs |
| `/studio/publishing/history/:publicationId` | Publication Detail | P1 | publication job + adapter response |

### Analytics

| Ruta propuesta | Pantalla | Prioridad | Fuente de datos |
| --- | --- | --- | --- |
| `/studio/analytics/content-performance` | Content Performance | P1 | analytics warehouse or derived metrics |
| `/studio/analytics/seo-metrics` | SEO Metrics | P1 | rankings, metadata quality, cluster data |

### Automation

| Ruta propuesta | Pantalla | Prioridad | Fuente de datos |
| --- | --- | --- | --- |
| `/studio/automation/pipelines` | Automation Pipelines | P2 | pipeline rules, autopublish rules |
| `/studio/automation/jobs` | Jobs Monitor | P0 | workers, queues, system jobs |

### Integrations

| Ruta propuesta | Pantalla | Prioridad | Fuente de datos |
| --- | --- | --- | --- |
| `/studio/integrations/cms` | CMS Integrations | P1 | site adapters, auth health |
| `/studio/integrations/webhooks` | Webhook Center | P1 | webhook destinations, delivery logs |
| `/studio/integrations/apis` | API Access | P1 | tenant keys, SDK contracts |

### Settings

| Ruta propuesta | Pantalla | Prioridad | Fuente de datos |
| --- | --- | --- | --- |
| `/studio/settings/workspace` | Workspace Settings | P1 | tenant, defaults, editorial policies |
| `/studio/settings/users` | Users | P2 | workspace users |
| `/studio/settings/roles` | Roles | P2 | roles, permissions |

## 3. Pantallas clave por fase

### Fase 1

- Dashboard
- All Projects
- Pipeline Board
- Brief Editor
- Article Editor
- Version Compare
- Image Generator
- QA Queue
- Destinations
- Publication History
- Jobs Monitor

### Fase 2

- Calendar
- Media Library
- Prompt Library
- Scheduled Queue
- CMS Integrations
- Webhook Center
- Content Performance
- SEO Metrics
- Workspace Settings

### Fase 3

- Automation Pipelines
- Users
- Roles
- experimentation
- copilots

## 4. Patrones de pantalla

### Board

Usar para:

- pipeline
- QA queue
- scheduled queue

### Split editor

Usar para:

- brief editor
- article editor
- version compare

### Registry

Usar para:

- projects
- briefs
- articles
- assets
- destinations

### Ops console

Usar para:

- jobs
- publications
- integrations
- analytics

## 5. Notas de migracion

- `channels/integrations` migra a `publishing/destinations`
- `ops/projects` se reparte entre `projects`, `editorial/pipeline` y `publishing/history`
- `deployments` deja de ser termino principal; se sustituye por `Publication History` y `Jobs Monitor`
- `sites` deja de ser etiqueta principal de producto; pasa a `Destinations`
- `dashboard` deja de hablar de bots y runtime generico; pasa a hablar de produccion editorial

## 6. Resultado del mapa

Este screen map convierte el panel en una arquitectura legible:

- planificar
- producir
- revisar
- publicar
- medir
- automatizar

Esa es la estructura correcta para Auctorio.
