# Talkaris Admin Redesign

Actualizado: marzo 2026

## 1. Objetivo del rediseño

Reconstruir el admin como un cockpit editorial SaaS premium comparable en claridad y control a Vercel, Linear o Supabase.

No se ha hecho un restyle menor.
Se ha cambiado la arquitectura de experiencia:

- nueva jerarquia de navegacion con 4 categorias (Dashboard, Operations, Control, Governance)
- nuevo shell con workspace card, permission-aware nav y session context
- auth enterprise dual (API key + OIDC/SSO) con route guards
- RBAC completo con UI de usuarios, roles y permission matrix
- prompt governance con presets, versiones y approval workflow
- dashboard cockpit con pipeline health, readiness, publishing feed
- 33 page components reales — sin placeholders

## 2. Principios de producto

### Clarity first

Cada pantalla responde una pregunta operacional:

- que se esta produciendo
- que fallo
- que esta listo para publicar
- quien tiene acceso
- que integraciones estan activas

### Permission-first

La UI filtra navegacion y acciones segun los permisos del usuario. 9 permisos RBAC gobiernan acceso a areas sensibles. Los route guards bloquean acceso directo por URL.

### One control plane

El usuario no salta entre paginas desconectadas. La navegacion, el dashboard y los detalles forman un sistema coherente.

### Review-first operations

La arquitectura visualiza estados, gates y riesgos. Pipeline health en dashboard, status tags semanticos, QA queue prominent.

## 3. Nueva arquitectura del sidebar

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

Items con `requiredPermission` se ocultan si el usuario no tiene el permiso correspondiente.

## 4. Pantallas rediseñadas

### Dashboard (cockpit)

Vista ejecutiva del workspace con:

- `StudioPageHeaderComponent` con header y permission-gated actions (Open pipeline, New project)
- `StudioStatStripComponent` con 4 KPIs: destinations, in production, published jobs, incidents
- Pipeline health: barra visual segmentada por estado (draft/AI/review/published/failed) + list cards con tags semanticos
- Quick actions: 6 actions permission-gated (create project, review QA, manage destinations, prompt library, publishing history, team directory)
- Recent publishing feed: 8 publications con status tag + date
- Workspace readiness checklist: destinations connected, pipeline active, publishing healthy, identity provider
- Destination directory sidebar: connected surfaces con locale y project counts
- Active projects sidebar: in-flight projects sorted by last update

### Users page

Directorio de usuarios del workspace con:

- `StudioStatStripComponent` con total users, active, pending invitations, roles defined
- Table de usuarios con nombre, email, roles, status y auth provider
- Side panel para invite user y edit user
- Asignacion de roles via select

### Roles page

Gestion RBAC con:

- Stats de system roles, custom roles, permissions, assigned seats
- Table de roles con nombre, key, tipo (system/custom), permisos y members
- Side panel para create/edit/clone roles
- Permission matrix via checkbox grid (9 permissions)
- Clone workflow para especializar system roles
- System roles read-only (no delete, no edit)

### Prompt Library

Governance de prompts con:

- Stats de presets, versions, active assignments, pending drafts
- Table de presets con name, key, latest version status, assignment count
- Detail view per preset: version history, site assignments
- Create/edit presets, create versions, approve versions
- Assign versions to sites

### Integrations (sites)

Directorio de destinos con:

- metricas superiores
- listado de sites con tipo, locale, project count, publication status
- editor lateral coherente
- lenguaje de integration en vez de formulario tecnico

### Pipeline

Motor editorial vivo:

- create form con brief, goal, site, language
- filtros y search local
- estados visibles con tags semanticos
- separacion clara entre draft, AI generation, review, publish

### Project detail

Control operativo fino:

- estado superior con actions (generate, revise, approve, publish)
- brief y metadata
- output actual
- QA results
- version timeline
- publication traceability

### Workspace settings

Configuracion del tenant:

- SSO/OIDC configuration
- Provisioning mode
- Tenant identity

## 5. Auth architecture implementada

### Route guards

Tres functional guards en `guards/studio-auth.guard.ts`:

1. `studioAuthGuard`: ensures session, redirects to login with `returnTo` parameter
2. `studioLoginGuard`: redirects authenticated users to dashboard
3. `studioPermissionGuard`: checks `route.data.requiredPermission`, redirects to dashboard if denied

### Session service

`StudioSessionService` con signal-based state:

- `session()`: readonly signal with current `StudioSession`
- `ensureSession(force?)`: loads/refreshes session, deduplicates inflight requests
- `hasPermission()` / `hasAnyPermission()`: permission checks
- `clearSession()`: logout cleanup

### Shell integration

`StudioShellComponent` filtra navegacion via:

```typescript
get navCategories(): StudioNavCategory[] {
  return STUDIO_NAV_CATEGORIES.map(category => ({
    ...category,
    groups: category.groups
      .map(group => ({
        ...group,
        items: group.items.filter(
          item => !item.requiredPermission || this.canAccess(item.requiredPermission)
        ),
      }))
      .filter(group => group.items.length > 0),
  })).filter(category => category.groups.length > 0);
}
```

## 6. RBAC model

### Permissions

9 permisos activos:

| Permission | Surfaces gated |
| --- | --- |
| `workspace.manage` | Workspace settings |
| `users.manage` | Users page, team directory action |
| `roles.manage` | Roles page |
| `prompts.manage` | Prompt Library, prompt topbar action |
| `projects.manage` | Create Project, new project topbar action, dashboard actions |
| `review.approve` | QA Queue dashboard action |
| `publishing.manage` | Destinations dashboard action |
| `integrations.manage` | CMS, Webhooks, APIs |
| `analytics.read` | Content Performance, SEO Metrics |

### Roles

- System roles (Owner, Admin): seedeados por tenant, no editables, cubren governance
- Custom roles: creados por admins, combinacion arbitrary de permisos
- Clone workflow: duplicar un system role como custom para especializar

## 7. Modelo mental

El usuario navega por capas de trabajo:

- **Dashboard**: estado ejecutivo del workspace
- **Operations**: producir contenido (projects, editorial, assets, AI)
- **Control**: supervisar y publicar (review, publishing, analytics, automation, integrations)
- **Governance**: administrar acceso (workspace, users, roles)

## 8. Patrones de UX incorporados

- topbar con contexto actual de seccion (kicker/title/description via `studioMeta`)
- command palette visual (boton en topbar)
- sidebar jerarquico con categorias, grupos y descripciones
- quick actions persistentes en sidebar footer
- stat strips reutilizables
- side panels para edicion in-context (users, roles, prompts)
- tags con colores semanticos (success/warning/danger/accent/muted)
- pipeline bar visual en dashboard
- readiness checklist en dashboard
- empty states contextuales con guia
- mobile nav off-canvas con backdrop

## 9. Shared components

6 Angular standalone components reutilizables:

- `StudioPageHeaderComponent`: kicker + title + intro + `[page-actions]` slot
- `StudioStatStripComponent`: grid de stat cards via `StudioStatItem[]`
- `StudioTableShellComponent`: eyebrow + title + `[table-actions]` + content
- `StudioEmptyStateComponent`: kicker + title + body + `[empty-actions]` slot
- `StudioSidePanelComponent`: eyebrow + title + content
- `AuctorioChatWidgetComponent`: widget de asistencia

## 10. Resultado de producto

El panel ha pasado de ser:

- pequeño
- tecnico
- parcial
- sin auth enforcement

a ser:

- jerarquico con 4 categorias de navegacion
- permission-aware con RBAC enforcement
- con auth enterprise (API key + OIDC/SSO)
- con governance de prompts
- con 33 page components reales
- con dashboard cockpit profesional
- escalable y preparado para las proximas fases
