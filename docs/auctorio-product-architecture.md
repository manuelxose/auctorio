# Auctorio Product Architecture

Fecha de auditoria: 11 de marzo de 2026

## 1. Resumen ejecutivo

El repositorio auditado ya contiene el nucleo de Auctorio como plataforma editorial con IA:

- control multi-tenant por API key
- cockpit SSR privado bajo `/studio`
- gestion de destinos de publicacion
- pipeline de contenido con proyectos, versiones y jobs
- generacion asincrona de texto e imagen
- QA automatizado
- derivados editoriales para newsletter y social
- publicacion multi-site con adapters por destino

El problema no es la ausencia de producto. Es la falta de coherencia entre producto, dominio y experiencia:

- la shell privada sigue nombrada y narrada como `Talkaris Platform`
- la navegacion superior responde a un producto de bots y conversaciones
- las pantallas vivas reales pertenecen a un pipeline editorial
- varias capacidades del backend existen pero no tienen superficie UI proporcional

La conclusion de la auditoria es clara: Auctorio debe dejar de presentarse como un panel hibrido y consolidarse como un cockpit editorial profesional para operar multiples webs con IA.

## 2. Fuentes auditadas

Archivos principales revisados:

- `prisma/schema.prisma`
- `src/studio/routes.ts`
- `src/studio/repository.ts`
- `src/studio/orchestration.ts`
- `src/studio/publishers.ts`
- `src/infrastructure/workers/worker-text.ts`
- `src/infrastructure/workers/worker-image.ts`
- `src/infrastructure/workers/worker-publishing.ts`
- `apps/studio-web/src/app/app.routes.ts`
- `apps/studio-web/src/app/layout/studio-shell.component.ts`
- `apps/studio-web/src/app/pages/*.component.ts`
- `apps/studio-web/src/styles.css`

## 3. Arquitectura actual del sistema

### 3.1 Frontend actual

El studio usa Angular 20 SSR y BFF same-origin. La base tecnica es correcta, pero la arquitectura de experiencia no.

Pantallas con datos reales:

- `Dashboard`
- `Integrations` (`sites`)
- `Pipeline` (`projects`)
- `Project detail`
- `Deployments`
- `Analytics`
- `Logs`
- `Login`

Pantallas placeholder o modeladas sin persistencia nativa:

- `Bots`
- `Conversations`
- `Knowledge`
- `AI`
- `Automation`
- `Users`
- `Developers`
- `Settings`

El shell lateral y el topbar siguen vendiendo un producto de bots:

- marca visible `Talkaris Platform`
- CTA `New bot`
- grupos `Build`, `Runtime`, `Admin`
- rutas de bots y conversaciones antes que el pipeline editorial real

### 3.2 API actual

La API ya separa dos capas:

#### v1 primitives

- `topics`
- `facts`
- `generate-text`
- `generate-image`
- `results`

Es una capa baja de contenidos y conocimiento.

#### v2 studio

- `session`
- `sites`
- `projects`
- `project generation`
- `project revision`
- `approval`
- `publication`
- `asset generation`
- `publications`

Es la capa de cockpit editorial que debe convertirse en la base de Auctorio.

### 3.3 Runtime actual

Workers detectados:

- scraping
- text
- image
- publishing

Infraestructura detectada:

- Fastify
- Prisma + PostgreSQL
- Redis + BullMQ
- almacenamiento local de assets
- adapters de publicacion por tipo de destino

## 4. Dominio actual

### 4.1 Entidades reales

| Entidad actual | Rol real en producto |
| --- | --- |
| `Tenant` | Workspace editorial |
| `Site` | Destino o publicacion conectada |
| `Topic` | Tema base de conocimiento |
| `Fact` | Evidencia o contexto para generacion |
| `ContentProject` | Contenedor de proyecto y brief |
| `ContentVersion` | Version editorial de una pieza |
| `ContentText` | Ejecucion de generacion de texto |
| `ContentImage` | Ejecucion de generacion de imagen |
| `ContentDerivative` | Reutilizaciones para newsletter y social |
| `AssetVariant` | Variantes publicables de media |
| `PublicationJob` | Ejecucion de publicacion o sincronizacion |
| `Job` | Job asincrono de sistema |
| `AiAudit` | Auditoria de prompt, modelo y coste |

### 4.2 Estados reales

Project:

- `draft`
- `ai_generated`
- `qa_failed`
- `qa_passed`
- `in_review`
- `approved`
- `publish_queued`
- `published`
- `publish_failed`

Version:

- `draft`
- `ai_generated`
- `qa_failed`
- `qa_passed`
- `approved`
- `published`
- `archived`

Publication:

- `queued`
- `processing`
- `draft_synced`
- `published`
- `failed`
- `canceled`

## 5. Workflow editorial reconstruido desde el backend

El flujo actual ya existe, aunque la UI no lo visualiza con suficiente claridad:

1. Se crea un `ContentProject` con `title`, `brief`, `goal` y `siteId`.
2. El sistema asegura o crea un `Topic` y registra el brief como `Fact`.
3. Se crea un `ContentText` en cola y una `ContentVersion`.
4. El worker de texto genera el contenido y lo sincroniza a la version.
5. Se derivan automaticamente `title`, `excerpt`, `bodyHtml`, `seoTitle`, `seoDescription` y piezas sociales.
6. Se dispara generacion de imagen y se adjunta a la version.
7. QA valida longitud, SEO, headings e imagen.
8. La version pasa a `qa_passed` o `qa_failed`.
9. Un humano aprueba.
10. Un `PublicationJob` publica, actualiza draft o retira contenido en el destino.

Este es el pipeline canonico que Auctorio debe mostrar como experiencia primaria:

`Brief -> Draft -> AI Generation -> Human Review -> Editing -> QA -> Scheduled -> Published`

## 6. Hallazgos de auditoria

### 6.1 Incoherencias estructurales

- El naming visual del panel no coincide con el producto real.
- La sidebar prioriza modulos conversacionales que no son el core persistido.
- `Projects` y `Pipeline` aparecen como capa secundaria bajo `Operations`.
- `Sites` se muestra como CRUD tecnico, no como red de destinos editoriales.
- `Analytics` y `Logs` usan datos reales, pero el lenguaje visual sigue siendo de runtime generico.

### 6.2 Funcionalidades incompletas

- El brief es un textarea plano con `metadata` en JSON.
- No existe editor estructurado de briefs.
- No existe article editor real, solo preview HTML.
- No existe comparador de versiones.
- No existe cola de revision editorial como inbox.
- No existe gestor de assets ni media library como sistema.
- No existe publication manager con calendario, programacion y history operativa.
- No existe panel SEO de topic planning, clustering o scorecards.
- No existe analitica editorial real; solo agregados de `projects`, `sites` y `publications`.
- No existen usuarios, roles, permisos ni governance operacional.

### 6.3 Features existentes pero poco o nada representadas

- base de conocimiento con `Topic` y `Fact`
- trazabilidad AI con `AiAudit`
- costes y providers por generacion
- derivados automaticos
- multi-site publishing adapters
- `draft`, `publish` y `unpublish`
- `dry-run` seguro cuando faltan credenciales
- variantes de asset
- workers especializados

### 6.4 Pantallas faltantes para un cockpit editorial serio

- visual pipeline board
- brief editor
- article editor
- version comparison
- image generator
- asset manager
- publication manager
- SEO panel
- analytics editorial
- destination detail
- job monitor
- webhook delivery center

## 7. Modelo de producto objetivo

### 7.1 Entidades canonicas de Auctorio

| Entidad objetivo | Fuente actual | Gap |
| --- | --- | --- |
| `Project` | `ContentProject` | Necesita ownership, priority, scheduling, folders |
| `EditorialPipeline` | estados de project/version/job | Falta como objeto visual y configurable |
| `Brief` | `brief` + `Fact` + `metadata` | Falta modelo estructurado |
| `Article` | `ContentVersion` | Falta editor y diff |
| `Version` | `ContentVersion` | Falta comparacion y restore |
| `Revision` | `feedback` + nuevas versiones | Falta entity y timeline humana |
| `Asset` | `ContentImage` + `AssetVariant` | Falta media library |
| `ImageGeneration` | `ContentImage` + `Job` | Falta monitor dedicado |
| `AIGeneration` | `ContentText` + `AiAudit` | Falta consola de ejecuciones |
| `QA` | `qaReport` | Falta queue y ownership |
| `Publication` | `PublicationJob` | Falta manager y scheduler |
| `Destination` | `Site` | Falta taxonomy de CMS / channel / environment |
| `Webhook` | `SiteType.webhook` + publisher generico | Falta entidad first-class |
| `Analytics` | agregados calculados | Falta store de metricas y paneles reales |

### 7.2 Relacion canonica

- un `Workspace` contiene multiples `Projects`
- un `Project` contiene un `Brief`, un `Pipeline` y multiples `Versions`
- una `Version` contiene `Article`, `Assets`, `QA`, `Revisions` y `Publication runs`
- un `Destination` publica contenido de multiples proyectos
- un `AIGeneration` puede producir texto, imagen o sugerencias editoriales
- `Analytics` se calculan por proyecto, destino, cluster y periodo

## 8. Capas del producto rediseñado

### Planning

- topic planning
- content clustering
- brief authoring
- editorial calendar

### Production

- article editor
- AI text generation
- AI image generation
- prompt library
- versioning

### Review

- QA queue
- editor review
- version comparison
- approval gates

### Publishing

- destinations
- scheduling
- publish history
- webhooks
- multi-site rollouts

### Intelligence

- SEO metrics
- content performance
- content experiments
- copilots y insights

### Governance

- workspace settings
- users
- roles
- APIs

## 9. Prioridades recomendadas

### P0

- corregir naming del producto en shell, login y topbar
- mover el pipeline editorial al centro de la IA del panel
- convertir `projects` en `Projects` y `Editorial`
- crear las pantallas clave del flujo editorial real

### P1

- brief editor
- article editor
- version comparison
- asset manager
- publication manager
- destinations

### P2

- calendario editorial
- SEO planning
- analytics editoriales
- automation jobs
- webhooks
- roles y permisos

### P3

- content clustering
- A/B testing
- auto-publishing rules
- copilots editoriales

## 10. North star

El usuario de Auctorio no debe sentir que opera formularios ni jobs sueltos.
Debe sentir que dirige una sala de control editorial donde puede:

- planificar temas
- producir contenido con IA
- revisar con criterio humano
- controlar calidad
- publicar en multiples webs
- medir resultados

Ese es el producto correcto para Auctorio.
