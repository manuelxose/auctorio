# Inventario de pantallas (código, no inspección visual en vivo)
| Ruta | Archivo principal | Observación sustentada |
|---|---|---|
| /studio/overview | pages/overview-page.component.ts | KPI, checklist, selector modo y lista destinos desde /v2/overview |
| /studio/site-intelligence | pages/site-intelligence-page.component.ts | tabs, indexación, estrategia versionada, coberturas y páginas |
| /studio/sources | pages/sources-page.component.ts | 1.477 líneas, registry + gestión fuente + discovery + test + salud |
| /studio/editorial-plan | pages/editorial-plan-page.component.ts | 520 líneas; calendario, backlog y pipeline sobre items |
| /studio/content | pages/content-list-page.component.ts | filtrado, artículo, origen manual/automático y estados |
| /studio/content/:id | pages/content-workspace-page.component.ts | editor/QA/publicación; inspección de handlers pendiente en E2E |
| /studio/calendar | pages/calendar-page.component.ts | 654 líneas; timeline/propuestas/publicaciones, acciones |
| /studio/automation | pages/automation-page.component.ts | modo, policy, límites y diagnósticos workers |
| /studio/connections | pages/connections-page.component.ts | instalaciones, cuentas, wizard y verificación |
| /studio/publishing | pages/publishing-page.component.ts | queue/published/destinations |
| /studio/publications | pages/publications-page.component.ts | publicación y retries |
| /studio/operations | pages/operations-page.component.ts | métricas y salud operativa |
| /studio/competencies | pages/competencies-page.component.ts | capacidades del asistente |

Otros: shell layout/app-shell.component.ts, navegación studio-nav.ts, copilot-panel.component.ts, assistant-api/copotilot services, API services. La ruta Overview no está en primer grupo visual: actual STUDIO_NAV agrupa Overview bajo Operations; validar prioridad ante usuarios no técnicos. Se identifican componentes extensos, no se ha probado que sean defectuosos por longitud sola.

La documentación histórica NAVIGATION.md describe seis grupos de sidebar; código actual studio-nav.ts contiene cuatro grupos de áreas. Tratar documentación como potencialmente desactualizada frente a HEAD. Faltan capturas browser recientes, mobile, focus navigation y network traces.
