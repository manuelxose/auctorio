# Auctorio Design System

Fecha de definicion: 11 de marzo de 2026

## 1. Direccion visual

Auctorio no debe sentirse como una app de marketing ni como una consola DevOps pura.
Debe sentirse como una herramienta editorial premium:

- clara como Notion
- precisa como Linear
- modular como Sanity Studio
- operativa como Vercel Dashboard

Tono visual:

- editorial
- data-dense
- sobrio
- potente

## 2. Principios del sistema

### Calm power

Mucho control, poca friccion visual.

### Editorial by design

El contenido debe respirar distinto al chrome de la aplicacion.

### State is the interface

El sistema de estados del pipeline es parte central del lenguaje visual.

### Structured density

La herramienta debe admitir mucha informacion sin parecer saturada.

## 3. Token architecture

### 3.1 Foundation tokens

```css
:root {
  --aui-canvas: #f4f1ea;
  --aui-panel: #ffffff;
  --aui-panel-muted: #f7f5f0;
  --aui-sidebar: #101820;
  --aui-sidebar-elevated: #16212c;
  --aui-stroke: #d8d4ca;
  --aui-stroke-strong: #b9b2a4;
  --aui-text: #17202a;
  --aui-text-muted: #5f6b76;
  --aui-text-soft: #7a8794;
  --aui-accent: #2f6fed;
  --aui-accent-soft: #e8f0ff;
  --aui-success: #1f8f63;
  --aui-success-soft: #e8f6ef;
  --aui-warning: #bf7a18;
  --aui-warning-soft: #fff3df;
  --aui-danger: #cf4d4d;
  --aui-danger-soft: #fdecec;
  --aui-seo: #0b8a72;
  --aui-seo-soft: #e2f7f1;
}
```

### 3.2 Semantic tokens

- `--surface-default`
- `--surface-editor`
- `--surface-rail`
- `--surface-selected`
- `--text-primary`
- `--text-secondary`
- `--state-brief`
- `--state-ai-generation`
- `--state-review`
- `--state-qa`
- `--state-scheduled`
- `--state-published`

### 3.3 Typography

Familias:

- `Manrope` para interfaz
- `Source Serif 4` para previews y reading surfaces
- `IBM Plex Mono` para IDs, traces y technical data

Escala:

- `display`: dashboard hero y titulos de modulo
- `title`: pantalla y panel
- `section`: bloques interiores
- `body`: datos y copy
- `meta`: labels, breadcrumbs, timestamps

## 4. Layout system

### App shell

- sidebar fija de 280px
- topbar contextual de una sola fila utilitaria
- canvas principal con max-width flexible

### Grid rules

- 12 columnas para dashboards y analytics
- split 8/4 para editores
- split 9/3 para operaciones
- stack de una columna en mobile

### Core primitives

- `PageFrame`
- `SurfaceCard`
- `SurfaceHeader`
- `ToolbarRow`
- `ContextRail`
- `SectionStack`
- `MetricStrip`

## 5. Component system

### Navigation

- sidebar item
- section group
- breadcrumb
- command palette trigger

### Data and workflow

- project card
- pipeline card
- stage header
- list row
- advanced table
- status chip
- progress stepper
- timeline item

### Editorial

- brief block
- article editor toolbar
- outline navigator
- SEO score card
- QA checklist
- version diff block
- comment pin

### Media

- image candidate card
- asset tile
- media detail drawer
- crop variant selector

### Publishing

- destination card
- publication run row
- schedule pill
- adapter health indicator

### Analytics

- KPI card
- sparkline block
- throughput chart
- SEO opportunity card

## 6. Estado visual del pipeline

Estados obligatorios:

- `Brief`
- `Draft`
- `AI Generation`
- `Human Review`
- `Editing`
- `QA`
- `Scheduled`
- `Published`

Regla:

- cada estado tiene color, icono, etiqueta y copy de ayuda
- cada bloqueo usa una variante de warning o danger
- published nunca debe verse igual que approved

## 7. Reglas de composicion

- maximo 4 KPIs por fila principal
- formularios de negocio en lenguaje editorial, no JSON-first
- rails laterales con contexto, no con informacion duplicada
- tablas densas solo en operaciones e historial
- boards para flujo, no para configuracion
- previews de contenido con tipografia de lectura, no con UI font

## 8. Motion

Motion minima, con proposito:

- stagger corto al cargar lists y boards
- transicion suave al mover items de stage
- diffs y compare con highlight contenido, no decorativo
- drawers y modales con desplazamiento corto y sin exceso de blur

## 9. Responsive behavior

### Desktop

- sidebar persistente
- split editors
- analytics 3 o 4 columnas

### Tablet

- sidebar colapsable
- rails como drawers
- boards con scroll horizontal controlado

### Mobile

- prioridad a queue, tasks y approvals
- editors en tabs
- actions sticky en footer

## 10. Accesibilidad

- contraste AA minimo
- estados nunca codificados solo por color
- shortcuts visibles para acciones clave
- focus ring consistente
- semantic headings por pantalla
- soporte completo a teclado en boards, tables y editors

## 11. Inventario de componentes para implementacion

### P0

- app shell
- dashboard widgets
- pipeline board
- project list
- brief editor
- article editor
- version compare
- QA checklist
- destination cards
- publication history table

### P1

- media library
- calendar
- jobs monitor
- analytics widgets
- webhook logs

### P2

- experiment cards
- cluster map
- copilots
- automation builder

## 12. Regla final

El design system de Auctorio no esta al servicio de una estetica vacia.
Esta al servicio de una sensacion muy concreta:

`operar una red editorial compleja con control, velocidad y criterio.`
