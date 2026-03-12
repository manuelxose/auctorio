# Auctorio Admin Redesign

Fecha de definicion: 11 de marzo de 2026

## 1. Objetivo

Convertir el panel privado en un cockpit editorial comparable en claridad operativa a Notion, Linear, Webflow CMS, Sanity Studio, Contentful y Vercel Dashboard.

No es un restyle. Es una reconstruccion de arquitectura de producto, UX y lenguaje visual.

## 2. Principios rectores

### Editorial control plane

El centro del producto no son formularios ni tabs tecnicos. El centro es el workflow editorial.

### Workflow before CRUD

Cada pantalla debe responder una pregunta operacional:

- que estamos produciendo
- en que etapa esta
- que bloqueo existe
- quien debe actuar ahora
- cuando y donde se publica

### Honest product architecture

La UI debe representar el dominio real del backend y, al mismo tiempo, preparar la siguiente capa de producto sin mezclar conceptos.

### Multi-site by default

Toda decision de UX debe asumir que una pieza puede vivir, adaptarse y publicarse en varias webs y destinos.

### Human-in-the-loop

La IA acelera, pero la experiencia se organiza alrededor de control humano, revision y QA.

## 3. Nueva arquitectura del panel

Sidebar propuesta:

- `Dashboard`
- `Projects`
  - `All Projects`
  - `Create Project`
- `Editorial`
  - `Pipeline`
  - `Calendar`
  - `Briefs`
  - `Articles`
  - `Versions`
- `Assets`
  - `Images`
  - `Media Library`
- `AI Generation`
  - `Text Generation`
  - `Image Generation`
  - `Prompt Library`
- `Review`
  - `QA Queue`
  - `Editor Review`
- `Publishing`
  - `Destinations`
  - `Scheduled`
  - `History`
- `Analytics`
  - `Content Performance`
  - `SEO Metrics`
- `Automation`
  - `Pipelines`
  - `Jobs`
- `Integrations`
  - `CMS`
  - `Webhooks`
  - `APIs`
- `Settings`
  - `Workspace`
  - `Users`
  - `Roles`

## 4. Shell de producto

### Sidebar

- navegacion persistente
- labels cortos
- descripcion contextual en hover o rail expandido
- contador por modulo cuando exista cola activa

### Topbar contextual

Debe incluir:

- breadcrumb editorial
- titulo de pantalla
- estado del workspace
- selector de proyecto o vista cuando aplique
- command palette
- quick actions

### Layout base

Tres patrones de layout:

- `Board layout` para pipeline y review queues
- `Editor split layout` para brief, article y compare
- `Ops layout` para analytics, destinations, jobs y logs

## 5. Dashboard rediseñado

Widgets obligatorios:

- articulos en produccion
- generacion IA activa
- revisiones pendientes
- publicaciones programadas
- rendimiento SEO

El dashboard no debe ser solo numerico. Debe funcionar como centro de decisiones:

- bloque de `Today`
- bloque de `Needs attention`
- bloque de `Publishing schedule`
- bloque de `SEO opportunities`
- actividad reciente por proyecto y destino

## 6. Pantallas clave

### 6.1 Editorial Pipeline Visual

Vista tipo board con columnas:

- Brief
- Draft
- AI Generation
- Human Review
- Editing
- QA
- Scheduled
- Published

Cada card debe mostrar:

- titulo
- destino principal
- owner
- fecha objetivo
- score SEO
- estado QA
- version activa
- alertas

### 6.2 Brief Editor

No debe ser un textarea plano.

Bloques:

- objetivo editorial
- audience
- target query
- intent
- structure outline
- source notes
- keywords
- destination rules
- linked cluster
- AI assistance panel

### 6.3 Article Editor

Layout split:

- canvas central para contenido
- rail derecha con SEO, QA, assets y publishing readiness
- rail izquierda opcional para outline, versions y comments

Modos:

- write
- preview
- seo
- publish prep

### 6.4 Version Comparison

Vista diff editorial, no tecnica:

- before / after
- cambios por bloque
- SEO delta
- QA delta
- approved changes

### 6.5 Image Generator

Superficie con:

- prompt
- style presets
- ratio
- brand constraints
- candidate gallery
- selected hero
- variants for destinations

### 6.6 Asset Manager

Media library unificada:

- heroes
- thumbnails
- social crops
- source images
- usage by article
- destination compatibility

### 6.7 Publication Manager

Debe resolver:

- ready to publish
- scheduled
- publishing now
- failed
- published

Con acciones por lote y visibilidad por destino.

### 6.8 SEO Panel

Vistas:

- keyword targets
- cluster alignment
- internal linking
- metadata quality
- cannibalization risk
- optimization suggestions

### 6.9 Analytics

Separar:

- content performance
- SEO metrics
- production throughput
- review bottlenecks
- publication success

## 7. Nuevo flujo editorial UX

Flujo recomendado:

1. Crear proyecto.
2. Construir brief estructurado.
3. Lanzar generacion de texto.
4. Revisar propuesta AI.
5. Editar contenido.
6. Generar o seleccionar imagen.
7. Pasar QA.
8. Programar o publicar.
9. Medir rendimiento.

Regla UX: el usuario siempre debe saber cual es el siguiente paso y por que.

## 8. Features futuras que deben representarse desde ya

### Content clustering

- mapa de clusters
- relacion brief-cluster-query
- opportunity score

### SEO topic planning

- idea backlog
- search demand
- intent mix
- content gaps

### Auto publishing

- reglas por destino
- ventanas horarias
- autopublish on QA pass
- safeguards

### Content A/B testing

- variants por headline
- variants por excerpt
- destination-level experiments

### AI editor copilots

- brief copilot
- SEO copilot
- style copilot
- QA copilot
- publishing copilot

## 9. Mapeo del backend actual al rediseño

Superficies que ya pueden vivir con datos reales en la primera fase:

- `Projects`
- `Editorial/Pipeline`
- `Assets/Images`
- `AI Generation/Text Generation`
- `AI Generation/Image Generation`
- `Review/QA Queue`
- `Publishing/Destinations`
- `Publishing/History`
- `Automation/Jobs`

Superficies que arrancan como hybrid surfaces:

- `Calendar`
- `Media Library`
- `Prompt Library`
- `Editor Review`
- `Scheduled`
- `SEO Metrics`
- `CMS`
- `Webhooks`
- `APIs`

## 10. Reglas de UX de Auctorio

- mostrar estados antes que acciones
- no esconder blockers criticos en tablas genericas
- usar boards para flujo y listas para operaciones
- reducir JSON y campos tecnicos en pantallas de negocio
- usar rail derecho como contexto vivo, no como relleno
- hacer visible la trazabilidad de IA sin contaminar el flujo principal
- mantener publish, draft sync y unpublish como acciones explicitas

## 11. Resultado esperado

El usuario debe sentir:

`Este es un cockpit editorial profesional para operar multiples webs con IA.`

Eso significa:

- workflow claro
- control visual
- trazabilidad
- velocidad
- confianza para publicar

Ese es el norte del rediseño.
