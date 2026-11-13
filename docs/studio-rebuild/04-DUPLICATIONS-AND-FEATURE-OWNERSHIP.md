# Matriz canónica de ownership
| Funcionalidad | Propietario UI | Sistema/entidad | Otras vistas permitidas |
|---|---|---|---|
| Elegir sitio/estado sesión | Shell y Settings | Site, session, AppContextService | Filtro contextual por pantalla |
| Configurar/verificar destinos | Connections | ConnectorInstallation / PublishingAccount / Site | Resumen solo lectura Overview |
| Estado real de conexión/readiness | Connections (config), Overview (resumen) | read model derivado único | Content aviso de bloqueo |
| Seleccionar Manual/Assisted/Autopilot | Automation (Settings avanzados), acceso directo Overview | AutomationPolicy, MODE_FLAGS | Solo visualización contextual |
| Conocer contenido/salud del sitio | Site Intelligence | SiteIndexedPage, SiteTopicCluster, Strategy | Oportunidades seleccionables en Plan |
| Fuentes y procedencia | Sources | ContentSource, SourceRecommendation | Evidencia contextual en Plan/Content |
| Benchmark competidores | Competitors/Intelligence | competencias/cobertura | Oportunidades trasladadas a Plan |
| Aprobar oportunidades/briefs | Editorial Plan | EditorialPlanItem | Link desde Overview |
| Escribir/revisar artículo | Content | ContentProject, ContentVersion, ProductionJob | Estado de generación en Plan |
| Publicar/programar contenido | Content como acción; Calendar como agenda | Publication y jobs canónicos | Plan muestra fecha propuesta, no otro scheduler |
| Estado/historial/retry | Publications | Publication, PublicationAttempt/Job | Resumen en Overview/Content |
| Configuración de políticas | Automation | AutomationPolicy | Selector sencillo en Overview |
| Workers, logs, circuitos | Ops/Admin | Operation, heartbeats | Alerta de usuario sin datos internos |
| Asistente contextual | Shell/Copilot | Copilot threads, competencies | Lanzadores contextuales con permiso |

No eliminar rutas o modelos porque las pantallas parecen redundantes. Preferir reutilizar servicio/estado y variantes visuales (read-only contextual, edición en owner).
