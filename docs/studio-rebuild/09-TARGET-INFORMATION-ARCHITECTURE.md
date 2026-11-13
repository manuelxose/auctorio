# Arquitectura de información propuesta (pendiente UX E2E)
Navegación superior global: logo, selector sitio, 4 áreas claras, búsqueda, actividad/notificaciones, usuario. Sidebar contextual de área con herramientas; lanzador Copilot persistente y accesible. No dos menús con enlaces duplicados. Diseño basado en código actual layout/studio-nav.ts y app-shell.component.ts; inspeccionar UX antes de decidir reorganización final.

- Workspace: Overview (landing principal), Inbox/acciones pendientes, Content de trabajo frecuente.
- Strategy & Intelligence: Site Intelligence (perfil/cobertura/SEO con evidencia), Sources (feeds/calidad), Competitors (benchmark solo verificable).
- Plan & Produce: Editorial Plan (decisiones/brief/propuesta de fecha), Content (redacción/QA/review), Calendar (fechas de publicaciones confirmadas), Media.
- Distribution & Automation: Connections (wizard + verificación), Publications (operaciones), Automation (modos, topes y ventanas). Publishing puede ser vista contextual fusionada con Publications si la paridad funcional lo permite.
- Admin/Advanced: worker diagnostics, circuit breakers, raw logs, provider errors, mutaciones privilegiadas, quotas globales, configuración de IA que no corresponda a editor.

Copilot como rail/panel contextual no intercepta acciones sensibles y no confunde sugerencias con operaciones ejecutadas. Roles y permisos backend, no solo ocultación de UI. Mantener deep-links y redirects existentes de app.routes.ts. La nomenclatura final depende de test de usabilidad.
