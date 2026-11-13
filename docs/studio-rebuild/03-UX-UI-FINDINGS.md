# UX/UI — hipótesis fundamentadas y criterios de validación
Estado: PARTIAL, sin browser en esta sesión. Evidencia histórica: docs/studio-rebuild/{NAVIGATION,DESIGN-SYSTEM,TEST-EVIDENCE}.md y 16 capturas archivadas bajo evidence/; pueden ser de commits anteriores.

Hallazgos por código:
- AppShell tiene global topbar, navegación horizontal por áreas, sidebar contextual, chatbot/copilot y paleta. El problema del usuario puede ser jerarquía o regresión, no ausencia de componentes (layout/app-shell.component.ts, studio-nav.ts).
- Overview coloca modos en checklist y lista destinations. Sus reglas de estado son demasiado permisivas y no muestran instalaciones modernas.
- Site Intelligence mezcla rastreo/operaciones con edición completa de estrategia; algunos controles requieren divulgación progresiva o Settings.
- Sources contiene 1477 líneas y combina registry, fuentes, pruebas, feeds, recomendaciones y diagnósticos. Separar componentes/estados sin duplicar API.
- Editorial Plan ya tiene tres vistas (calendar/backlog/pipeline) y Calendar otra vista; aclarar "propuesta" vs "publicación confirmada".
- Automation integra controles de usuario y health avanzado; segmentar permisos.
- Publishing y Publications muestran aspectos operativos similares; definir destinos, publicaciones y cola sin dos fuentes de verdad.

Criterios antes de implementar cambios visuales:
1. Lanzar app local de forma no destructiva; autenticación consentida.
2. Capturar desktop 1440/1024 y mobile 390 en Overview, Intelligence, Sources, Plan, Content y Calendar; estados sin sitio/sin datos/error/cargando.
3. Playwright: recorrido teclado, focus, navegación horizontal/lateral/copilot, overlays, lectores de pantalla donde disponibles y contraste.
4. Mapear cada CTA a handler, endpoint, efecto persistente y permiso.
5. Cargar ui-ux-pro-max y unslop desde entorno Claude si realmente están instaladas; documentar versión/rutas.
6. Mantener dos navegaciones legibles: superior global y lateral contextual con copiloto accesible, sin overlay intrusivo.

No declarar puntos visuales PASS hasta capturas comparables y pruebas.
