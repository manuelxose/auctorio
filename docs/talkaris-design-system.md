# Talkaris Design System

Actualizado: marzo 2026

## 1. Visual direction

La dirección visual del admin busca transmitir:

- precision
- control
- velocidad
- madurez tecnica

Referencias de sensacion:

- Linear
- Vercel
- Supabase
- Raycast

No se busca:

- gigantismo de cards
- colorido infantil
- paneles planos sin jerarquia
- formularios administrativos viejos

## 2. Tokens

### Color

Base del cockpit:

- `--console-bg`: fondo estructural profundo
- `--console-sidebar-bg`: capa de navegacion
- `--console-panel`: superficie principal
- `--console-panel-strong`: variantes de panel enfatizado
- `--console-stroke`: borde suave
- `--console-stroke-strong`: borde activo
- `--console-text`: texto principal
- `--console-muted`: texto secundario
- `--console-subtle`: texto de apoyo
- `--console-accent`: azul/violeta de accion
- `--console-accent-soft`: relleno semantico suave
- `--console-success` / `--success`: verde de validacion
- `--console-warning` / `--warning`: naranja de atencion
- `--console-danger` / `--danger`: rojo de incidencia

### Typography

Familias:

- `Inter` como fuente principal de interfaz (400, 500, 600, 700)
- `Manrope` para headings (600, 700, 800)
- `Source Serif 4` para cuerpos largos y previews de contenido

Jerarquia:

- page title: gran peso, tracking negativo
- section title: contundente pero compacto
- kicker: uppercase, tracking alto, color accent, 0.66rem, 800 weight
- meta text: claro pero secundario

### Radius

- 14px a 24px en shell y superficies
- pills 999px para tags, actions y chips

### Shadow

- sombra amplia y suave para profundidad
- sin exagerar blur o glow

### Spacing

Sistema compacto:

- 0.25rem a 1rem para espacios cortos
- 1rem a 1.5rem para composicion de paneles
- no usar bloques gigantes vacios

## 3. Layout primitives

### Console shell

- sidebar fija con grupos de navegacion jerarquica (4 categorias: Dashboard, Operations, Control, Governance)
- sidebar con workspace card (tenant, auth mode, destinations, projects)
- quick actions persistentes en sidebar footer
- topbar con contexto de seccion (kicker + title + description)
- area principal con grids de 2 columnas (main + aside)
- permission-aware nav filtering — items se ocultan si el usuario no tiene el permiso requerido

### Surface

La unidad base del cockpit es `console-surface`:

- borde sutil
- fondo translucido oscuro
- radio consistente
- cabecera integrada con eyebrow + title + optional action link

### Workspace split

Muchas pantallas siguen el patron:

- main column para tabla, lista o editor
- aside column para contexto, señales, checklist o acciones

## 4. Componentes

### Shared Angular components

El sistema incluye 6 componentes reutilizables en `components/`:

- `StudioPageHeaderComponent`: kicker, title, intro + slot `[page-actions]`
- `StudioStatStripComponent`: grid de stat cards via `StudioStatItem[]` (label, value, detail)
- `StudioTableShellComponent`: eyebrow, title + slots `[table-actions]` y `<ng-content>`
- `StudioEmptyStateComponent`: kicker, title, body + slot `[empty-actions]`
- `StudioSidePanelComponent`: eyebrow, title + `<ng-content>` para formularios laterales
- `AuctorioChatWidgetComponent`: widget de asistencia integrado

### Buttons

- `console-button`: accion primaria
- `console-button--secondary`: accion de soporte
- `console-button--full`: ancho completo
- `console-command-button`: acceso a command palette visual

### Tags

- `console-tag`: base neutral
- `console-tag--accent`: accion seleccionada
- `console-tag--success`: publicado, aprobado
- `console-tag--warning`: en progreso, pendiente
- `console-tag--danger`: fallo, bloqueado
- `console-tag--muted`: contexto secundario

Uso: estados de pipeline, publication status, project status, locale badges

### Stat cards

Dos patterns:

- `console-stat-grid` + `console-stat-card`: grid de KPIs en dashboard
- `StudioStatStripComponent`: variante reutilizable para pages de gestion

Patron: label pequeno → valor dominante → detalle explicativo breve

### Pipeline bar

`console-pipeline-bar`: barra horizontal segmentada que visualiza la distribucion del pipeline editorial.

Segmentos con colores semanticos:
- `--draft`: muted
- `--ai`: warning
- `--review`: accent
- `--published`: success
- `--failed`: danger

### Checklist

`console-checklist`: lista de readiness checks con icono circular de estado (ok/pending).

Usado en dashboard para workspace readiness (destinations, pipeline, publishing health, identity provider).

### Navigation items

Cada item de sidebar incluye:

- nombre
- descripcion corta
- `requiredPermission` opcional (filtra por RBAC)

Categorias de nav: `console-nav__category` (accent color, small uppercase, letter-spacing 0.22em)

### Tables and list cards

El sistema usa dos patterns:

- `console-table` para filas densas (via `StudioTableShellComponent`)
- `console-list-card` para items mas descriptivos

### Feed

`console-feed` + `console-feed__item`: lista cronologica para publishing activity, con trail (status tag + timestamp).

### Forms

Campos:

- label arriba
- input oscuro con borde sutil
- focus con ring azul controlado
- acciones agrupadas al final
- `FormArray` de checkboxes para permission matrix (roles page)

### Empty states

Via `StudioEmptyStateComponent`:

- titulo
- explicacion
- accion siguiente como slot

No se usan vacios mudos.

## 5. Interaction rules

### Status-first

Cada surface responde el estado antes que el detalle. Tags con colores semanticos en toda tabla y feed.

### Permission-first

La UI filtra acciones y nav items por permisos del usuario. Quick actions del dashboard son permission-gated.

### Action locality

La accion vive cerca del contexto, no escondida en menus opacos. Side panels para edicion in-context.

### Dense but readable

El panel se siente potente, no saturado.

### Mobile behavior

- sidebar off-canvas con backdrop
- topbar con menu toggle
- grids colapsan a una columna
- botones pasan a ancho completo

## 6. Semantica del sistema

El design system refuerza la arquitectura de producto:

- accent = accion o estado seleccionado
- success = publicado, aprobado, healthy
- warning = en progreso, requiere atencion
- danger = fallo, incidente, bloqueado
- muted = contexto secundario, locale, metadata

## 7. Component inventory real

Componentes implementados y activos:

### Shell y layout
- `StudioShellComponent`: sidebar, topbar, workspace card, permission-aware nav
- `StudioPageHeaderComponent`: header reutilizable con slot de acciones

### Data display
- `StudioStatStripComponent`: grid de KPIs
- `StudioTableShellComponent`: tabla con header y acciones
- `StudioEmptyStateComponent`: estado vacio contextual
- `StudioSidePanelComponent`: panel lateral de edicion

### Dashboard
- Pipeline bar (CSS component)
- Checklist (CSS component)
- Feed con trail (CSS component)

### Widget
- `AuctorioChatWidgetComponent`

## 8. Proximos componentes recomendados

Para la siguiente fase:

- command palette real (actualmente solo boton visual)
- modal system
- toast / notification system
- skeleton loaders
- data table con sort y pagination
- timeline component para version history
- diff viewer para version compare
- permission matrix visual mejorada

## 9. Conclusion

El design system no persigue decoracion.
Persigue convertir el panel en una herramienta de trabajo seria:

- consistente
- escalable
- clara
- orientada a operacion
- permission-aware

La siguiente fase deberia consolidar los componentes CSS puros (pipeline-bar, checklist, feed) como Angular standalone components reutilizables.
