# MASTER PROMPT — AUCTORIO STUDIO COMPLETE INTEGRATION & PRODUCTION-GRADE REBUILD

## 0. Punto de continuación · 23 de noviembre de 2026

Continúa la integración existente de Auctorio Studio. Usa este bloque como estado de partida y el resto del prompt como alcance y criterios originales. Trabaja sobre `C:/Users/Admin/Documents/workspace/auctorio`, rama `feat/studio-settings-advanced-integration`. En este traspaso, `HEAD` era `c702517` y había cambios locales de la integración sin confirmar. Revisa `git status` y conserva ese trabajo.

### Estado verificado

| Área | Estado |
|---|---|
| Settings · Configuración | 9 herramientas y 25 pestañas del workspace integradas en la navegación. Se abrieron las 25 en escritorio. Se probaron los selectores móviles y el diálogo de invitación. Hay capturas y pruebas de pantallas concretas. Falta el cotejo visual completo con el adjunto, así que aún se desconoce cuántas necesitan retoques. |
| Advanced | 8 herramientas y 24 pestañas integradas. Se comprobó la navegación de las 24 y se registraron capturas de referencia y de Studio a 1440 y 390 px. Falta certificar la paridad visual exacta de todas. La última corrección fue Fuentes → Diagnósticos y paquetes. Se verificó en Chrome local y pasaron la prueba específica y la regresión de navegación de Advanced. |
| Descubrimiento web (§7.5) | La interfaz muestra política y límites usando los campos existentes. La integración funcional completa sigue pendiente por decisión del usuario. Retomarla después del cotejo visual de Settings y Advanced. |
| Administración global | Workspaces, Proveedores IA y Uso global conservan sus rutas. Falta validar las tres con una cuenta con permisos de plataforma. |
| Lanzamiento | La aceptación de producción sigue abierta. Quedan el recorrido editorial completo y la validación operativa en preproducción. Consulta el informe de preparación para el detalle. |

### Siguiente tarea

1. Empieza por **Settings → Sitios → Sitios y destinos**. Abre su equivalente en el prototipo y en el Studio local. Compara a 1440 y 390 px con datos representativos. Comprueba estructura, estilos, navegación, estados, acciones y comportamiento responsive.
2. Continúa por **Identidad del sitio** y después sigue el orden de la barra lateral del adjunto hasta cubrir las 25 pestañas del workspace. Corrige cada diferencia observada y conserva los flujos, datos y permisos reales. Una pestaña queda visualmente aceptada cuando se coteja con la referencia y se registra el resultado. Las comprobaciones de títulos, rutas y ancho cubren la navegación y el comportamiento responsive.
3. Registra por pestaña la ruta, la referencia, el resultado visual, los cambios y las pruebas. Actualiza `docs/rebuild/UI-ACCEPTANCE.md`. Valida Administración global con una sesión de plataforma cuando esté disponible. Conserva la marca pendiente de §7.5 hasta retomar esa integración.

### Referencias y evidencia

- Prototipos en `C:/Users/Admin/Downloads/settings/auctorio-settings-advanced-final/auctorio-settings-advanced`. Para Settings, usa `index.html`, `styles.css` y `app.js`. Para Advanced, usa `advanced.html`, `advanced.css` y `advanced.js`. Los JavaScript generan parte del contenido y de los estados de cada pantalla.
- [Aceptación visual y capturas](./UI-ACCEPTANCE.md)
- [Informe de integración](./STUDIO-INTEGRATION-REPORT.md)
- [Matriz de paridad funcional](./FUNCTIONAL-PARITY-MATRIX.md)
- [Preparación de lanzamiento](./RELEASE-READINESS.md)
- [Diagnósticos y paquetes en Studio local](http://localhost:4420/studio/sources?tab=settings)
- Para este último cambio se verificaron la revisión previa de paquetes, el formulario de proveedores, los estados de comprobación y la sección de dominios. La importación efectiva y las conexiones externas quedaron sin verificar.

## ROLE AND MISSION

You are the Lead Software Architect, Principal Full-Stack Engineer, UX/UI Engineering Lead, Security Engineer, and Technical Delivery Orchestrator responsible for the final integration of the redesigned Auctorio Studio.

**Your mission is to transform the supplied design prototypes, technical audits, HTML/CSS/JavaScript files, screenshots, and specifications into a fully integrated, secure, maintainable, production-ready implementation within the existing Auctorio codebase.**

This is an implementation mission, not a design exercise, research-only assignment, or proof of concept.

The user has already reviewed and approved the overall visual direction of the redesigned interfaces.

You must preserve this visual direction while integrating it with the application's real data, backend APIs, permissions, services, workflows, and business logic.

### Core objective

Deliver a coherent Auctorio Studio where:

- Every redesigned screen uses real application data.
- Every implemented action operates through the correct backend contract.
- Existing capabilities remain available.
- Duplicate interfaces and competing workflows are consolidated.
- Roles and permissions are enforced server-side.
- User-facing configuration is separate from privileged administration.
- All navigation is consistent.
- The application remains responsive and accessible.
- The complete editorial workflow works end to end.
- No mock functionality is presented as operational.
- No existing customer content or configuration is lost.

**Completion requires verified functionality, not merely a successful build.**

---

# 1. MANDATORY INPUT DOCUMENTS

The user will attach the approved redesign package and related documents.

These may include:

- `auctorio-settings-advanced-final.zip`
- `auctorio-settings-audit.md`
- `auctorio-advanced-source.zip`
- `AUDITORIA-Y-REBUILD.md`
- `auctorio-overview-source.zip`
- `auctorio-editor-source.zip`
- Instagram redesign HTML/CSS/JS
- Reddit and Quora Opportunities redesign HTML/CSS/JS
- Screenshots, responsive previews, and related documentation

Other files may be included.

## Mandatory inspection

Before modifying code:

1. Identify every attached file.
2. Extract all provided archives.
3. Read every technical audit and integration document.
4. Inspect all HTML, CSS, and JavaScript prototypes.
5. Inspect screenshots and responsive layouts.
6. Identify navigation structures and interactive behavior.
7. Build a complete inventory of represented screens, tabs, actions, forms, dialogs, and states.
8. Compare the supplied designs with the actual repository implementation.
9. Identify any contradictions between documents.
10. Resolve inconsistencies using the priority rules below.

Do not silently ignore files or sections.

### Source-of-truth hierarchy

1. Existing database integrity and security invariants.
2. Existing backend contracts and verified business requirements.
3. Explicit requirements in this master prompt.
4. Approved redesign specifications and audits.
5. Supplied visual prototypes.
6. Existing frontend implementation.
7. Professional UX/UI recommendations where specifications are incomplete.

A visual prototype is a design specification, not proof that its simulated functionality is implemented.

Do not copy demo data, fake counters, artificial workflows, or localStorage-based simulations into the production application.

Use real backend data.

If a feature requires backend support, implement that support or document a genuine blocker. Never silently replace it with a mock.

---

# 2. REPOSITORY DISCOVERY AND ENVIRONMENT

Work directly within the existing Auctorio repository and workspace.

Repository reference:

`https://github.com/manuelxose/auctorio`

Known development URL:

`http://localhost:4420`

First, establish the actual repository state.

Inspect:

- Git status and current branch.
- Angular application architecture.
- Application routing and guards.
- Shared navigation components.
- Design system and CSS tokens.
- Frontend services and state management.
- Backend APIs and services.
- PostgreSQL/Prisma schemas and migrations.
- Authentication and session handling.
- Role-based access control.
- Background workers and queues.
- Editorial production engine.
- Publishing subsystem.
- Existing automated tests.
- Existing browser/E2E infrastructure.
- Workspace instructions and project-specific engineering skills.

Do not assume the previously reviewed GitHub code is identical to the current local workspace.

Use the local checked-out implementation as the operational source of truth.

### Git safety

- Preserve existing uncommitted work.
- Never run destructive cleanup commands against user changes.
- Create a dedicated integration branch from the appropriate current baseline.
- Use isolated worktrees where useful.
- Keep independent agents from editing the same files simultaneously.
- Integrate completed work in controlled increments.
- Run relevant tests after each integration.
- Commit coherent, working milestones.

Do not force-push or bypass protected branch policies.

Do not deploy to production without explicit authorization.

---

# 3. MULTIAGENT EXECUTION

Use the available Codex multiagent capabilities when supported.

Use only OpenAI/Codex models available in the configured environment.

Avoid unnecessary orchestration overhead.

Assign bounded responsibilities with concrete deliverables.

## Specialist responsibilities

### Architecture and functional parity

Audit the existing application and construct the definitive integration map.

Own:

- Route ownership.
- Feature boundaries.
- Duplicate functionality.
- Existing API compatibility.
- Data migrations.
- Functional coverage.
- Integration sequencing.

### Frontend and design system

Implement the approved visual language in Angular.

Own:

- Component architecture.
- Navigation.
- Responsive layouts.
- Shared UI primitives.
- Accessibility.
- Forms.
- Loading and error states.
- Interactive workflows.

### Backend and integrations

Implement or adapt the actual services required by the redesigned interfaces.

Own:

- API contracts.
- Persistence.
- Service integration.
- Real-time operational state.
- Validation.
- Error handling.
- Background operations.

### Security and RBAC

Own:

- Permission enforcement.
- Roles.
- Membership management.
- Tenant isolation.
- Session invalidation.
- Privilege escalation prevention.
- Administrative boundaries.
- Destructive-operation protections.

### Quality assurance

Own:

- Functional parity tests.
- Unit and integration tests.
- E2E browser tests.
- Visual regression.
- Responsive tests.
- Accessibility.
- Independent verification.

Use parallel execution where files and dependencies are independent.

Do not create an endless hierarchy of reviewers.

Perform one substantive independent final review, remediate its findings, and rerun the affected tests.

All final reports must be written in Spanish.

---

# 4. GLOBAL DESIGN SYSTEM

Preserve the approved Auctorio visual direction.

The new application must visually align with the supplied redesigns.

### Design characteristics

- Warm, neutral application background.
- Clean white or near-white surfaces.
- Purple as the primary interactive accent.
- Subtle borders and restrained shadows.
- Consistent rounded corners.
- Compact but readable typography.
- Clear visual hierarchy.
- Professional SaaS appearance.
- Consistent status indicators.
- Controlled visual density.
- Responsive layouts.
- Accessible controls.

Do not introduce a different design system.

## Shared shell

Auctorio already has a global application structure.

Preserve:

- Global header.
- Global site selector.
- Primary horizontal navigation.
- Contextual left sidebar.
- Assistant integration.
- Global search.
- Notifications.
- Global creation actions.

**Do not duplicate the global header inside individual screens.**

The supplied prototypes may include navigation elements for demonstration. Extract the appropriate page-level components rather than mounting duplicate navigation shells.

## Shared components

Identify and reuse existing components whenever appropriate.

Consolidate duplicated implementations of:

- Buttons.
- Inputs.
- Selects.
- Search controls.
- Tabs.
- Segmented controls.
- Status badges.
- KPI cards.
- Tables.
- Pagination.
- Drawers.
- Dialogs.
- Confirmation flows.
- Form validation.
- Toasts.
- Empty states.
- Skeletons.
- Progress indicators.
- Contextual action menus.

Do not create large page-specific CSS implementations when shared components would solve the problem.

Preserve theme compatibility and design tokens.

---

# 5. DEFINITIVE INFORMATION ARCHITECTURE

The objective is a single coherent product, not a collection of isolated screens.

Auctorio's principal areas remain:

- Home
- Calendar
- Articles
- Results
- Advanced
- Settings

Each area must have a clearly defined responsibility.

## Home

Operational overview.

It answers:

- What needs attention?
- What is running?
- What has been published?
- What is scheduled?
- What requires intervention?

## Calendar

The authoritative user interface for editorial scheduling.

It owns:

- Publication dates.
- Editorial schedule.
- Rescheduling.
- Planned slots.
- Calendar-based approvals and scheduling actions.

## Articles

The authoritative article workspace.

It owns:

- Article content.
- Versions.
- Editing.
- SEO metadata.
- Article media.
- Quality checks.
- Article-specific social drafts.
- Article publication actions.

## Results

The authoritative publication operations interface.

It owns:

- Publication attempts.
- Delivery status.
- Retries.
- Cancellation.
- Republishing.
- Unpublishing.
- Destination outcomes.

## Advanced

Editorial research, intelligence, planning, operational inspection, and specialist tools.

## Settings

Persistent configuration, identities, permissions, integrations, policies, and administration.

**Each capability must have one authoritative management location.**

Other screens may display summaries, previews, or contextual shortcuts, but must not maintain independent copies of the same configuration.

---

# 6. ADVANCED — COMPLETE INTEGRATION

Integrate every section and subsection represented in the attached Advanced redesign.

The existing application includes eight principal areas.

## 6.1 Site Intelligence

Preserve and integrate:

- Detected site profile.
- Editorial strategy.
- Audience.
- Languages.
- Markets.
- Editorial voice and restrictions.
- Strategy versions.
- Strategy restoration.
- Content pillars.
- Topic clusters.
- Coverage.
- Content gaps.
- SEO signals.
- Sitemaps.
- Crawl status.
- Indexed-site inventory.
- Analysis and re-analysis operations.
- Evidence and provenance.
- Connections with editorial planning.

Important distinction:

**Auctorio's crawled or discovered pages are not necessarily indexed by Google.**

Never label internal crawl inventory as verified Google indexation.

Show data provenance and timestamps.

## 6.2 Competitors

Integrate:

- Competitor discovery.
- Manual competitor registration.
- Competitor approval.
- Editing.
- Suspension and removal.
- Coverage comparison.
- Topic opportunities.
- Improvement opportunities.
- Cannibalization warnings.
- Opportunity prioritization.
- Transfer to editorial planning.

Avoid duplicating the editorial backlog.

An opportunity transferred to the plan must have a traceable relationship with its originating evidence.

## 6.3 Sources

Preserve all existing capabilities:

- Active editorial sources.
- Source recommendations.
- Source discovery.
- Source registration.
- Feed detection.
- Connection testing.
- Source health.
- Fetch history.
- Evidence.
- Bulk operations.
- Source configuration.
- Source packs.
- Enrichment providers.
- Domain blocking.
- Advanced extraction configuration.

Keep ordinary editorial source management separate from privileged technical configuration.

Do not remove an existing ingestion capability simply because the prototype does not illustrate it.

## 6.4 Inbox

Integrate:

- Story discovery.
- Source filtering.
- Status filtering.
- Prioritization.
- Story details.
- Story clusters.
- Evidence.
- Fact ledgers.
- Deduplication.
- Merge/split operations.
- Rejection.
- Source and topic muting.
- Creation of editorial proposals.
- Traceable article generation.

Avoid creating competing article-generation pathways.

## 6.5 Plan Backlog

Integrate:

- Editorial plan selection.
- Plan generation.
- Keyword-led proposals.
- Brief editing.
- Topic clusters.
- Generation settings.
- Evidence.
- Outlines.
- Internal link suggestions.
- Approval and rejection.
- Bulk operations.
- Regeneration.
- Archiving.
- Plan extension.
- Pipeline visualization.

Use the existing planning entities rather than creating an independent replacement.

Scheduling must remain synchronized with Calendar.

## 6.6 Review Queue

Preserve:

- Generated-content review.
- Provenance inspection.
- Fact-ledger inspection.
- Editorial quality checks.
- Evidence licensing.
- Generation status.
- Approval and rejection.
- SEO review.
- Social previews.
- Publication decisions.

Distinguish:

1. Approving a proposed topic or brief.
2. Approving an actual generated article.

Do not combine these into one ambiguous action.

No content may bypass the server-side quality and approval gates.

## 6.7 Media

Integrate:

- Image inventory.
- Image variants.
- Generation status.
- Error inspection.
- Image preview.
- Retry.
- Selection.
- Bulk actions.
- Unused media filtering.
- Deletion.
- Related article context.

Never delete an asset still referenced by an article or publication without a verified, safe lifecycle operation.

## 6.8 Background Jobs

Integrate:

- Queued operations.
- Running operations.
- Completed operations.
- Failed operations.
- Cancelled operations.
- Progress.
- Related content.
- Error summaries.
- Retry.
- Cancellation.
- Filtering.
- Pagination.
- Live updates where supported.

Do not confuse customer-visible job activity with privileged worker administration.

---

# 7. SETTINGS — COMPLETE REBUILD

Integrate the entire approved Settings redesign.

The application must expose all existing functions in a coherent, professional structure.

## 7.1 Sites and Business

Implement:

- Site inventory.
- Active-site selection.
- New site connection.
- Site information.
- Site details.
- Website destination configuration.
- Business information.
- Branding.
- Site-specific defaults.
- Safe site deletion.
- Connected website status.

Preserve site isolation.

Deleting a site requires explicit confirmation and clear disclosure of what is deleted in Auctorio versus what remains on the destination website.

## 7.2 Writing and Content Configuration

Integrate all existing article-writing settings:

- Writing instructions.
- Rules and exclusions.
- Writing length.
- Content structure.
- Summary configuration.
- Table of contents.
- FAQ.
- Source attribution.
- Internal linking.
- Images and visual style.
- Infographics.
- Video configuration.
- Calls to action.
- Business positioning.
- Audience.
- Product or service offerings.
- Branding.
- Disclaimers.

Ensure these settings actually influence subsequent article generation.

Existing articles must not be silently rewritten when global writing settings change.

Distinguish site-level defaults from article-specific overrides.

## 7.3 Automation and Publishing Policies

Integrate:

- Manual mode.
- Assisted mode.
- Autopilot mode.
- Publication cadence.
- Timezone.
- Daily article limits.
- Social publication limits.
- Minimum spacing.
- Publishing windows.
- Quality thresholds.
- Repair attempts.
- Circuit breakers.
- Candidate-selection rules.
- Queue limits.
- Pause/resume.
- Recovery of interrupted jobs.
- Connection verification.
- Upcoming publishing slots.

Preserve the exact semantics enforced by the current backend.

The mode selected in Settings must be reflected consistently in Home and Calendar.

Never implement a client-side toggle that claims automation was enabled or paused unless the backend confirms the change.

Separate everyday settings from advanced safety controls.

## 7.4 Connections

Implement a single authoritative connections management experience.

Include:

- Connected websites.
- Social accounts.
- Installation state.
- Verification state.
- Credential state.
- Permission errors.
- Reconnection.
- Activation.
- Disconnection.
- Installation recovery.
- Connection diagnostics.

Never expose stored secrets in the browser.

## 7.5 Web Discovery

**Estado de integración: pendiente. Retomar después del rediseño de Settings y Advanced.**

Integrate:

- Discovery activation.
- Manual/recommended/automatic modes.
- Search frequency.
- Daily search limits.
- Scraping limits.
- Cost limits.
- Languages.
- Regions.
- Source-quality rules.
- Provider availability.
- Manual discovery execution.

Results must be managed from Sources.

Do not duplicate the source recommendation workflow.

## 7.6 Assistant Tools

Preserve the actual competency registry and available assistant tools.

Integrate:

- Available competencies.
- Allowed contexts.
- Tool execution.
- Results.
- Recent runs.
- Permission restrictions.
- Execution failures.

Avoid inventing competencies or implying that simulated outputs are real.

---

# 8. COMPLETE RBAC AND PEOPLE MANAGEMENT

**This is a security-critical implementation milestone.**

The previous audit identified missing frontend capabilities and backend authorization concerns.

Do not mark this milestone complete until those concerns are resolved and tested.

## 8.1 Existing permission model

The backend currently defines these nine permissions:

1. `workspace.manage`
2. `users.manage`
3. `roles.manage`
4. `prompts.manage`
5. `projects.manage`
6. `review.approve`
7. `publishing.manage`
8. `integrations.manage`
9. `analytics.read`

Use the actual permission model as the basis for the first implementation.

Do not invent backend permissions merely to populate the matrix.

Where finer-grained authorization is genuinely necessary, design explicit versioned backend changes with tests and migration compatibility.

## 8.2 System roles

Inspect and preserve the current system roles:

- Owner
- Admin
- Editor
- Reviewer
- SEO Manager
- Publisher

Also support the existing custom-role capability.

Do not assume that role names alone determine authorization.

The backend's effective permissions are authoritative.

System roles must remain protected against unauthorized modification.

## 8.3 Role management

Implement the complete UI for:

- Listing roles.
- Inspecting role permissions.
- Creating custom roles.
- Cloning existing roles.
- Editing custom roles.
- Assigning permissions.
- Removing permissions.
- Inspecting affected members.
- Comparing role permissions.
- Displaying effective access.

Use the existing backend role APIs wherever possible.

If a requested operation has no backend endpoint, implement the missing contract only when its semantics, authorization, migration, and regression tests are fully defined.

Do not present a nonfunctional action.

## 8.4 People management

Implement:

- Member inventory.
- Member search and filters.
- Invitations.
- Role assignment.
- Multiple roles per member.
- Role removal.
- Member status.
- Suspension.
- Reactivation.
- Effective permissions.
- Invitation state.
- Error handling.
- Permission explanations.

Where the backend lacks invitation cancellation, resending, or permanent removal, explicitly distinguish these from already supported operations and implement them safely if in scope.

## 8.5 Prevent privilege escalation

Audit these endpoints:

- `POST /v2/users/:id/roles`
- `DELETE /v2/users/:id/roles/:roleId`
- `PATCH /v2/users/:id`
- `POST /v2/roles`
- `PATCH /v2/roles/:id`
- `POST /v2/users/invitations`

The previous inspection identified that role assignment currently requires `users.manage` but does not additionally enforce the authority needed to grant privileged roles.

Fix the underlying issue.

Requirements:

- An actor must not grant permissions they are not authorized to grant.
- Role assignment must be checked against the actor's effective permissions.
- Creating or editing privileged roles requires appropriate authorization.
- Authorization is enforced on the server.
- Client checks are only supplementary.
- Tenant boundaries are enforced for every affected entity.
- Concurrent role changes cannot bypass invariants.

## 8.6 Prevent administrative lockout

The workspace must never accidentally lose all authorized administrators.

Protect:

- The last effective administrator.
- The last owner where ownership semantics require one.
- Critical self-removal.
- Critical self-suspension.
- Concurrent removal of administrators.
- Conflicting role changes.

Implement safeguards transactionally.

Do not rely on a frontend-only check.

## 8.7 Session security

Review session validity after:

- Member suspension.
- Role removal.
- Permission reduction.
- Account deactivation.
- Tenant suspension.

Ensure authorization changes take effect without relying indefinitely on stale permissions.

Test session revocation and permission refresh behavior.

## 8.8 Platform administration

Distinguish clearly:

**Workspace administrator:** manages one authorized workspace.

**Platform administrator:** manages platform-wide systems and cross-workspace operations.

Workspace admin must not automatically receive platform administrator capabilities.

Preserve the existing platform-admin authorization mechanism unless a formally reviewed replacement is necessary.

---

# 9. PLATFORM ADMINISTRATION AND SYSTEM HEALTH

Preserve privileged capabilities such as:

- Workspace inventory.
- Tenant status.
- Workspace plans.
- Platform-wide usage.
- AI provider administration.
- Secure credential configuration.
- Worker health.
- Queue pressure.
- Production job diagnostics.
- Critical failures.
- Cost controls.

Keep these separate from everyday customer-facing configuration.

Inspect and retain the existing permission boundaries.

Cost settings must not be confused with actual observed expenses.

Provider credentials must be stored and handled securely.

Never log or expose API keys.

---

# 10. ALIGNMENT WITH PREVIOUS REDESIGNS

Where the relevant artifacts are attached or the current repository contains their integrated versions, ensure consistency with:

- Home / Overview.
- Article editor.
- Instagram publication management.
- X publication management.
- Reddit Opportunities.
- Quora Opportunities.
- Advanced.
- Settings.

Reuse the same design tokens and interaction patterns.

Avoid unnecessary visual changes to areas that already conform.

Do not rebuild unrelated features merely because they exist in the application.

However, resolve cross-module inconsistencies that directly affect this integration.

---

# 11. FUNCTIONAL PARITY IS MANDATORY

Before replacing any page, create an inventory containing:

| Field | Requirement |
|---|---|
| Route | Existing URL and navigation ownership |
| Feature | Current capability |
| Data | Existing API and persistence |
| Authorization | Required backend permission |
| New location | Where it appears after redesign |
| Action | Actual operation invoked |
| UI states | Loading, success, error, empty, disabled |
| Tests | Evidence required |
| Verdict | Preserved, improved, safely replaced, or blocked |

Every existing capability must be accounted for.

Do not delete an existing feature because it was absent from the design files.

If functionality is redundant, identify the authoritative implementation before removing duplicates.

If a capability is technical or administrative, relocate it appropriately rather than deleting it.

Preserve existing routes or provide safe redirects.

Preserve deep links and query parameters where required.

---

# 12. FRONTEND IMPLEMENTATION RULES

Implement native Angular components.

Do not embed prototype HTML in iframes.

Do not copy prototype JavaScript state management into the final application.

Use the application's actual:

- Services.
- Reactive state.
- Router.
- Forms.
- Authentication context.
- Permissions.
- Design tokens.
- Shared components.
- Notification system.

Prefer extracting reusable presentational components over creating oversized monolithic page components.

Provide accessible labels and keyboard interactions.

Implement:

- Loading states.
- Empty states.
- Form validation.
- Error handling.
- Confirmation dialogs.
- Success feedback.
- Disabled states.
- Retry behavior.
- Dirty-form warnings.
- Responsive navigation.

All destructive actions must use an explicit confirmation pattern and enforce authorization.

Do not show false success messages.

---

# 13. BACKEND AND DATA INTEGRATION

Use the existing backend wherever it already supports the required feature.

Add endpoints only where genuinely needed.

Requirements:

- Strict validation.
- Tenant isolation.
- Site scoping.
- Permission checks.
- Auditability.
- Correct error semantics.
- Idempotency where relevant.
- Safe retries.
- Transactional invariants.
- No accidental duplicate records.

Preserve existing data models and migrations unless a documented change is required.

Any schema change must have:

1. A forward migration.
2. Backward-compatibility analysis.
3. Data-preservation verification.
4. Migration tests.
5. A safe rollout strategy.

Never reset the database to make the new UI work.

Never silently discard existing settings.

---

# 14. IMPLEMENTATION PHASES

Execute the following phases sequentially, parallelizing independent tasks within them.

## PHASE A — Discovery and audit

Deliver:

- Exact repository baseline.
- Artifact inventory.
- Existing route inventory.
- Functional parity matrix.
- Duplicate functionality report.
- Security findings.
- API gap analysis.
- Dependency map.

Proceed directly into implementation unless a genuine authorization or access blocker exists.

## PHASE B — Shared architecture

Implement:

- Shared design tokens.
- Common UI components.
- Contextual navigation.
- Route integration.
- Common dialog patterns.
- Permission-aware controls.

Validate before migrating major pages.

## PHASE C — Settings

Integrate all Settings sections and their actual workflows.

Complete RBAC/backend security remediation before considering People and Roles production-ready.

## PHASE D — Advanced

Integrate all Advanced sections.

Consolidate ownership and remove only verified duplicate implementations.

Preserve evidence, editorial state, and existing operations.

## PHASE E — Cross-module integration

Verify relationships across:

- Site Intelligence → Plan.
- Competitors → Opportunities → Plan.
- Sources → Inbox.
- Inbox → Brief.
- Brief → Generation.
- Generation → Review.
- Review → Article.
- Article → Calendar.
- Calendar → Publishing.
- Publishing → Results.
- Results → Operations.
- Settings → Automation → Overview.

Each handoff must preserve the same underlying entities.

## PHASE F — Quality and security hardening

Fix defects found by tests and functional inspection.

No visual or functional workaround may bypass backend security or quality gates.

## PHASE G — Independent acceptance

Perform a bounded independent review against the original requirements and parity matrix.

Fix confirmed issues.

Rerun affected tests.

Prepare final delivery evidence.

---

# 15. TESTING AND ACCEPTANCE

Testing must use real application behavior and controlled test data.

Do not validate production-readiness using the prototypes alone.

## Functional tests

Exercise all accessible screens and actions.

Verify:

- Forms persist and reload correctly.
- Filters work.
- Navigation works.
- Deep links work.
- Errors are displayed.
- No action disappears.
- No duplicate workflow is introduced.
- Real backend status is reflected correctly.

## Security tests

Include at least:

- Viewer attempting administrative operations.
- Editor attempting publication without permission.
- Reviewer attempting unrelated configuration changes.
- Member with `users.manage` attempting unauthorized privilege escalation.
- Unauthorized custom role creation.
- Unauthorized role assignment.
- Cross-tenant role assignment.
- Cross-tenant user mutation.
- Last-admin removal.
- Concurrent admin removals.
- Self-suspension.
- Suspended account with an existing session.
- Permission reduction with an existing session.
- Platform administration by workspace-only admin.
- API access using manipulated frontend state.

These must be backend authorization tests, not just UI tests.

## Visual tests

Compare the implemented pages against the supplied screenshots.

Test at least:

- 1600 px.
- 1440 px.
- 1024 px.
- 768 px.
- 390 px.

Verify:

- No horizontal overflow.
- Correct navigation behavior.
- Readable forms.
- Accessible dialogs.
- Consistent cards.
- Correct spacing.
- Responsive tables.
- Appropriate mobile interaction.

Capture before/after screenshots.

## Regression tests

Run relevant:

- TypeScript type checks.
- Angular builds.
- Backend tests.
- Unit tests.
- Integration tests.
- E2E tests.
- Authorization tests.
- SSR checks.
- Accessibility checks.

Do not mark a failing test as passed.

If a test cannot run because of an external dependency, document exactly what remains unverified.

---

# 16. EXECUTION DISCIPLINE

Do not stop after analysis.

Do not stop after producing a plan.

Do not stop after implementing one page.

Do not stop after a successful build if functionality remains unverified.

Continue through the implementation and validation phases as far as the available environment and permissions allow.

Do not repeatedly ask for approval for ordinary engineering decisions.

Only request user intervention when necessary for:

- Missing credentials or access.
- Destructive operations affecting real user data.
- Production deployment.
- Irreversible infrastructure changes.
- Decisions with material business or security consequences.

Do not disclose secrets.

Do not weaken tests to obtain a green result.

Do not invent test results.

Keep technical documentation concise and useful.

Optimize tool usage and context consumption without sacrificing verification.

Use existing engineering skills and repository conventions rather than introducing unnecessary frameworks.

---

# 17. FINAL DELIVERABLES

Produce the following in the repository:

### 1. Integration report

`docs/rebuild/STUDIO-INTEGRATION-REPORT.md`

Include:

- Implemented modules.
- Architecture changes.
- Removed duplications.
- New shared components.
- Backend changes.
- Database changes.
- Security fixes.
- Known limitations.

### 2. Functional parity report

`docs/rebuild/FUNCTIONAL-PARITY-MATRIX.md`

Every original function must have a disposition and verification evidence.

### 3. Security report

`docs/rebuild/RBAC-SECURITY-REPORT.md`

Include:

- Permission matrix.
- Role management.
- Privilege escalation findings.
- Remediation.
- Last-admin safeguards.
- Session invalidation.
- Tests.
- Remaining risks.

### 4. UX/UI verification

`docs/rebuild/UI-ACCEPTANCE.md`

Include:

- Screen inventory.
- Screenshot references.
- Responsive verification.
- Accessibility findings.
- Design deviations and reasons.

### 5. Test report

`docs/rebuild/TEST-RESULTS.md`

Include exact test commands, counts, results and blockers.

### 6. Deployment readiness

`docs/rebuild/RELEASE-READINESS.md`

Identify:

- Migration requirements.
- Configuration requirements.
- Deployment steps.
- Rollback considerations.
- Production blockers.
- Final GO/NO-GO verdict.

---

# 18. FINAL ACCEPTANCE CRITERIA

Do not claim completion unless all applicable conditions are verified.

- [ ] Every attached design artifact was inspected.
- [ ] All existing functions are accounted for.
- [ ] Settings is fully integrated.
- [ ] Advanced is fully integrated.
- [ ] Navigation is consistent.
- [ ] Duplicate functionality has been consolidated safely.
- [ ] Angular uses real backend services.
- [ ] No demo data appears as real data.
- [ ] All implemented actions persist correctly.
- [ ] RBAC is enforced on the server.
- [ ] Privilege escalation paths are closed.
- [ ] Last-admin protection is enforced transactionally.
- [ ] Sessions respect permission changes.
- [ ] Tenant isolation passes.
- [ ] Platform administration remains isolated.
- [ ] All major workflows pass E2E verification.
- [ ] Desktop and mobile layouts are validated.
- [ ] Existing data is preserved.
- [ ] Regression tests pass.
- [ ] Final documentation is complete.

If any criterion fails, report PARTIAL or BLOCKED with evidence.

Do not claim production readiness based on unverified assumptions.

---

# 19. FINAL RESPONSE FORMAT

All user-facing reports must be written in Spanish.

At completion, provide:

**A. Executive result**

What has been integrated and what changed.

**B. Architecture**

How Settings, Advanced and the other Studio modules are organized.

**C. Functionality**

What works end to end, backed by actual test evidence.

**D. Security**

Exact RBAC changes, protections and remaining concerns.

**E. Visual verification**

Screenshots and responsive results.

**F. Tests**

Exact commands and outcomes.

**G. Git**

Branch, commits and integration status.

**H. Production readiness**

GO, PARTIAL or BLOCKED, with justification.

**I. Outstanding issues**

Only genuine unresolved issues, ordered by severity.

Do not conceal incomplete work.

Do not deploy to production without explicit authorization.

## EXECUTION ORDER

Begin immediately by inspecting the attached artifacts and current repository.

Build the parity and architecture inventory.

Then execute the complete implementation, security hardening, integration tests and acceptance review.

**The objective is not to deliver a redesigned frontend. The objective is to deliver one coherent, secure and fully functional Auctorio Studio whose new interface and existing business logic operate as a single system.**