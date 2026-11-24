# Aceptación de interfaz

Las referencias aprobadas son `settings-desktop.png`, `settings-mobile.png`, `permissions-desktop.png` y `roles-desktop.png`. El paquete también incluye las vistas interactivas `index.html` y `advanced.html`. El inventario de pantallas y acciones está en [la matriz de paridad](FUNCTIONAL-PARITY-MATRIX.md).

## Adaptación

- Studio conserva su barra superior, navegación contextual y componentes existentes. Sitios incorpora las tarjetas de resumen, estados de conexión y tabla desplazable. Roles incorpora la tabla de permisos, con roles personalizados y recuentos del servidor.
- La invitación y edición se presentan como formularios en la página. La confirmación común se mantiene para acciones sensibles. Las tablas tienen encabezados semánticos y una región desplazable accesible por teclado.
- El vocabulario principal permanece en el idioma de las pantallas Angular existentes. Los informes y la evidencia de entrega están en español.

## Resultados de navegador

Playwright comprobó Sitios y Roles a 1600, 1440, 1024, 768 y 390 px sin desbordamiento horizontal de página. La tabla conserva desplazamiento propio en móvil. El recorrido de Advanced abrió las ocho herramientas y verificó las vistas enlazadas de Competidores e Inbox. Un workspace temporal de PostgreSQL aportó los registros de prueba.

- [Sitios · 1600 px](../../test-results/studio-integration-accepta-56dc7-out-page-overflow-at-1600px/sites-1600.png)
- [Sitios · 1440 px](../../test-results/studio-integration-accepta-6f64b-out-page-overflow-at-1440px/sites-1440.png)
- [Sitios · 1024 px](../../test-results/studio-integration-accepta-da682-out-page-overflow-at-1024px/sites-1024.png)
- [Sitios · 768 px](../../test-results/studio-integration-accepta-ba3bd-hout-page-overflow-at-768px/sites-768.png)
- [Sitios · 390 px](../../test-results/studio-integration-accepta-58708-hout-page-overflow-at-390px/sites-390.png)
- [Roles · 1600 px](../../test-results/studio-integration-accepta-56dc7-out-page-overflow-at-1600px/roles-1600.png) y [Roles · 390 px](../../test-results/studio-integration-accepta-58708-hout-page-overflow-at-390px/roles-390.png)

Las capturas son resultados locales regenerables de Playwright. Las imágenes adjuntas aportan la referencia visual previa. Falta una captura del checkout anterior al cambio y una revisión con lector de pantalla, además de la comparación integral de los estados restantes.

## Escritura

Playwright verificó la separación de borradores y la persistencia de reglas al cambiar de sitio desde el shell. La página mantuvo el ancho de la ventana a 1440 y 390 px. [Escritura · 1440 px](../../test-results/studio-writing/studio-integration-accepta-bd8db-witching-sites-in-the-shell/writing-1440.png) · [Escritura · 390 px](../../test-results/studio-writing/studio-integration-accepta-bd8db-witching-sites-in-the-shell/writing-390.png)

## Automatización

Chrome comprobó la selección pendiente de modo, su persistencia tras guardar, la pausa conservada y la coincidencia del estado confirmado en Inicio y Calendario. Modo y ritmo mantuvo el ancho de la ventana a 1440 y 390 px. [Automatización · 1440 px](../../test-results/studio-automation/studio-integration-accepta-61da5--Settings-Home-and-Calendar/automation-1440.png) · [Automatización · 390 px](../../test-results/studio-automation/studio-integration-accepta-61da5--Settings-Home-and-Calendar/automation-390.png)

## Conexiones

Chrome comprobó el estado de verificación, la confirmación para desconectar, la persistencia al recargar y el acceso al asistente de recuperación. La vista se mantuvo dentro de la ventana a 1440 y 390 px. [Conexiones · 1440 px](../../test-results/studio-connections/studio-integration-accepta-264f4-website-without-deleting-it/connections-1440.png) · [Conexiones · 390 px](../../test-results/studio-connections/studio-integration-accepta-264f4-website-without-deleting-it/connections-390.png)

## Rediseño de Configuración y Advanced

Chrome verificó el ancho de Sitios y Roles a 1600, 1440, 1024, 768 y 390 px. En escritorio se probó el enlace entre áreas. A 390 px se comprobó que los selectores reflejan la ruta actual, abren la herramienta y sección elegidas y sincronizan su valor al volver atrás en el navegador.

- [Sitios · 1600 px](../../test-results/studio-interface-rebuild/studio-integration-accepta-56dc7-out-page-overflow-at-1600px/sites-1600.png)
- [Sitios · 390 px](../../test-results/studio-interface-rebuild/studio-integration-accepta-58708-hout-page-overflow-at-390px/sites-390.png)
- [Personas · 390 px](../../test-results/studio-interface-rebuild/studio-integration-accepta-5d5c2-ve-tool-and-section-in-sync/people-390.png)
- [Advanced · 390 px](../../test-results/studio-interface-rebuild/studio-integration-accepta-5d5c2-ve-tool-and-section-in-sync/advanced-390.png)

## Paridad de navegación de Configuración y Advanced

La revisión de escritorio abrió las 25 subvistas de Configuración y las 24 de Advanced. En móvil se verificaron ambos selectores y el diálogo de invitación, incluido el cierre con Escape. También se comprobó la navegación entre Conexiones y Ajustes de redes, el acceso a Auditoría y el filtro heredado de trabajos fallidos.

- [Sitios · 390 px](../../test-results/studio-reference-acceptance/studio-integration-accepta-58708-hout-page-overflow-at-390px/sites-390.png)
- [Matriz de permisos · 1600 px](../../test-results/studio-reference-acceptance/studio-integration-accepta-56dc7-out-page-overflow-at-1600px/roles-1600.png)
- [Invitación · 390 px](../../test-results/studio-reference-acceptance/studio-integration-accepta-5d5c2-ve-tool-and-section-in-sync/invite-390.png)
- [Advanced · 390 px](../../test-results/studio-reference-acceptance/studio-integration-accepta-5d5c2-ve-tool-and-section-in-sync/advanced-390.png)

Queda pendiente una comparación visual pantalla por pantalla y la validación de Administración global con una cuenta de plataforma.

## Directorio y gestión de acceso

Se comprobó el directorio a 1440 y 390 px, la apertura y cierre del diálogo, la persistencia de nombre y roles y la confirmación de suspensión.

- [Personas · 1440 px](../../test-results/studio-people/studio-integration-accepta-e9c1c-r-from-the-directory-dialog/people-1440.png)
- [Personas · 390 px](../../test-results/studio-people/studio-integration-accepta-5d5c2-ve-tool-and-section-in-sync/people-390.png)
- [Gestionar acceso · 1440 px](../../test-results/studio-people/studio-integration-accepta-e9c1c-r-from-the-directory-dialog/manage-access-1440.png)

## Advanced · Site Intelligence y Competidores

Chrome verificó el perfil editorial a dos columnas en escritorio y apilado en móvil, el salto al inventario, la búsqueda de competidores y el filtro de oportunidades. Los registros de perfil, rastreo y oportunidades se sembraron en un workspace temporal de PostgreSQL.

- [Perfil y estrategia · 1440 px](../../test-results/studio-advanced-views/studio-integration-accepta-605a1-dence-and-reflows-on-mobile/site-profile-1440.png)
- [Perfil y estrategia · 390 px](../../test-results/studio-advanced-views/studio-integration-accepta-605a1-dence-and-reflows-on-mobile/site-profile-390.png)
- [Competidores · 1440 px](../../test-results/studio-advanced-views/studio-integration-accepta-50c62-cords-on-desktop-and-mobile/competitors-1440.png)
- [Oportunidades · 390 px](../../test-results/studio-advanced-views/studio-integration-accepta-50c62-cords-on-desktop-and-mobile/opportunities-390.png)

## Advanced · Fuentes a Trabajos en segundo plano

La revisión en Chrome comprueba los encabezados y cuatro indicadores por pantalla, la distribución de columnas a 1440 y 390 px y el ancho de página. También comprueba el detalle y los filtros de Fuentes, el alta de una fuente, el tablero del plan y la navegación de las 49 subvistas. La referencia se abrió desde los archivos adjuntos con tráfico externo bloqueado.

| Pantalla | Escritorio | Móvil |
|---|---|---|
| Fuentes | [1440 px](../../test-results/studio-advanced-reference/studio-integration-accepta-38886-t-desktop-and-mobile-widths/sources-1440.png) | [390 px](../../test-results/studio-advanced-reference/studio-integration-accepta-38886-t-desktop-and-mobile-widths/sources-390.png) |
| Inbox | [1440 px](../../test-results/studio-advanced-reference/studio-integration-accepta-38886-t-desktop-and-mobile-widths/inbox-1440.png) | [390 px](../../test-results/studio-advanced-reference/studio-integration-accepta-38886-t-desktop-and-mobile-widths/inbox-390.png) |
| Plan editorial | [1440 px](../../test-results/studio-advanced-reference/studio-integration-accepta-38886-t-desktop-and-mobile-widths/plan-1440.png) | [390 px](../../test-results/studio-advanced-reference/studio-integration-accepta-38886-t-desktop-and-mobile-widths/plan-390.png) |
| Cola de revisión | [1440 px](../../test-results/studio-advanced-reference/studio-integration-accepta-38886-t-desktop-and-mobile-widths/review-queue-1440.png) | [390 px](../../test-results/studio-advanced-reference/studio-integration-accepta-38886-t-desktop-and-mobile-widths/review-queue-390.png) |
| Biblioteca multimedia | [1440 px](../../test-results/studio-advanced-reference/studio-integration-accepta-38886-t-desktop-and-mobile-widths/media-1440.png) | [390 px](../../test-results/studio-advanced-reference/studio-integration-accepta-38886-t-desktop-and-mobile-widths/media-390.png) |
| Trabajos en segundo plano | [1440 px](../../test-results/studio-advanced-reference/studio-integration-accepta-38886-t-desktop-and-mobile-widths/activity-1440.png) | [390 px](../../test-results/studio-advanced-reference/studio-integration-accepta-38886-t-desktop-and-mobile-widths/activity-390.png) |

## Site Intelligence · Perfil y estrategia

Se cotejó `advanced.html#intelligence/profile` en Chrome a 1440 y 390 px. Se trasladaron la cuadrícula, las cinco tarjetas, el formulario principal y la línea temporal con las medidas de `advanced.css`. En esta vista la cabecera global se abre con **Controles de Studio**. Los indicadores, campos y versiones corresponden al sitio activo.

| Ancho | Adjunto | Vista integrada |
|---|---|---|
| 1440 px | [Referencia](../../test-results/studio-profile-prototype/profile-1440.png) | [Studio](../../test-results/studio-site-profile-parity/studio-integration-accepta-605a1-dence-and-reflows-on-mobile/site-profile-1440.png) |
| 390 px | [Referencia](../../test-results/studio-profile-prototype/profile-390.png) | [Studio](../../test-results/studio-site-profile-parity/studio-integration-accepta-605a1-dence-and-reflows-on-mobile/site-profile-390.png) |

La prueba de aceptación guarda una versión, deshace una edición, consulta el historial, restaura una versión y navega al inventario. Comprueba también que se pueda volver a abrir la cabecera y que el formulario pase a una columna en móvil.

En la instancia de desarrollo de `localhost:4420`, se verificó el perfil con GuíaProgramaciónTV después de actualizar la plantilla que Angular conservaba en memoria. La configuración de desarrollo usa recarga completa para los cambios de componentes.

## Site Intelligence · Cotejo de las cuatro pestañas

El contenido y la navegación se cotejaron con `advanced.html` a 1440 y 390 px. En `localhost:4420`, las cuatro pestañas abrieron con la sesión de GuíaProgramaciónTV. Se verificaron la edición y persistencia de un pilar, la aparición de su brecha, la inspección de señales SEO y la búsqueda y el detalle de páginas del inventario.

| Pestaña | Escritorio | Móvil |
|---|---|---|
| Perfil y estrategia | [Adjunto](../../test-results/studio-intelligence-prototype/site-profile-1440.png) · [Studio](../../test-results/studio-intelligence-sections/studio-integration-accepta-605a1-dence-and-reflows-on-mobile/site-profile-1440.png) | [Adjunto](../../test-results/studio-intelligence-prototype/site-profile-390.png) · [Studio](../../test-results/studio-intelligence-sections/studio-integration-accepta-605a1-dence-and-reflows-on-mobile/site-profile-390.png) |
| Pilares y brechas | [Adjunto](../../test-results/studio-intelligence-prototype/site-pillars-1440.png) · [Studio](../../test-results/studio-intelligence-sections/studio-integration-accepta-605a1-dence-and-reflows-on-mobile/site-pillars-1440.png) | [Adjunto](../../test-results/studio-intelligence-prototype/site-pillars-390.png) · [Studio](../../test-results/studio-intelligence-sections/studio-integration-accepta-605a1-dence-and-reflows-on-mobile/site-pillars-390.png) |
| Señales SEO | [Adjunto](../../test-results/studio-intelligence-prototype/site-seo-1440.png) · [Studio](../../test-results/studio-intelligence-sections/studio-integration-accepta-605a1-dence-and-reflows-on-mobile/site-seo-1440.png) | [Adjunto](../../test-results/studio-intelligence-prototype/site-seo-390.png) · [Studio](../../test-results/studio-intelligence-sections/studio-integration-accepta-605a1-dence-and-reflows-on-mobile/site-seo-390.png) |
| Páginas y rastreo | [Adjunto](../../test-results/studio-intelligence-prototype/site-crawl-1440.png) · [Studio](../../test-results/studio-intelligence-sections/studio-integration-accepta-605a1-dence-and-reflows-on-mobile/site-crawl-1440.png) | [Adjunto](../../test-results/studio-intelligence-prototype/site-crawl-390.png) · [Studio](../../test-results/studio-intelligence-sections/studio-integration-accepta-605a1-dence-and-reflows-on-mobile/site-crawl-390.png) |

La barra de un pilar representa su peso relativo en el plan. Los niveles de alcance SEO representan la proporción de páginas afectadas dentro de la muestra. La edición de pilares se abre en su tarjeta y el guardado conserva el historial versionado de Studio.

## Competidores · Cotejo de las tres pestañas

La lista utiliza tarjetas de dos columnas en escritorio, la cobertura utiliza la matriz del adjunto y las oportunidades aparecen como filas con evidencia y acciones. Se comprobó que las tres vistas cargaban en la sesión de GuíaProgramaciónTV en `localhost:4420`.

| Pestaña | 1440 px | 390 px |
|---|---|---|
| Competidores | [Adjunto](../../test-results/studio-competitors-prototype/shortlist-1440.png) · [Studio](../../test-results/studio-competitors-reference/studio-integration-accepta-50c62-cords-on-desktop-and-mobile/competitors-1440.png) | [Adjunto](../../test-results/studio-competitors-prototype/shortlist-390.png) · [Studio](../../test-results/studio-competitors-reference/studio-integration-accepta-50c62-cords-on-desktop-and-mobile/competitors-390.png) |
| Cobertura temática | [Adjunto](../../test-results/studio-competitors-prototype/coverage-1440.png) · [Studio](../../test-results/studio-competitors-reference/studio-integration-accepta-50c62-cords-on-desktop-and-mobile/coverage-1440.png) | [Adjunto](../../test-results/studio-competitors-prototype/coverage-390.png) · [Studio](../../test-results/studio-competitors-reference/studio-integration-accepta-50c62-cords-on-desktop-and-mobile/coverage-390.png) |
| Oportunidades | [Adjunto](../../test-results/studio-competitors-prototype/opportunities-1440.png) · [Studio](../../test-results/studio-competitors-reference/studio-integration-accepta-50c62-cords-on-desktop-and-mobile/opportunities-1440.png) | [Adjunto](../../test-results/studio-competitors-prototype/opportunities-390.png) · [Studio](../../test-results/studio-competitors-reference/studio-integration-accepta-50c62-cords-on-desktop-and-mobile/opportunities-390.png) |

La prueba verifica la búsqueda de competidores, los detalles de un tema detectado, la matriz con una muestra y el paso de una fila a la búsqueda de oportunidades por tema.

## Advanced · Las 24 pestañas

Las ocho herramientas comparten la cabecera, navegación lateral y selector móvil del adjunto. Se abrieron las 24 pestañas en `localhost:4420` con la sesión de GuíaProgramaciónTV y se comprobó que cada enlace seleccionara su panel.

Las 19 pruebas de aceptación pasaron. La suite comprueba títulos, selección del menú y ausencia de desbordamiento de página a 1440 y 390 px. Las capturas de Studio se tomaron con datos de un workspace de prueba.

| Pestaña | Escritorio, 1440 px | Móvil, 390 px |
|---|---|---|
| Site Intelligence · Perfil y estrategia | [Adjunto](../../test-results/studio-advanced-all-prototype/site-intelligence-profile-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/site-intelligence-profile-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/site-intelligence-profile-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/site-intelligence-profile-390.png) |
| Site Intelligence · Pilares y brechas | [Adjunto](../../test-results/studio-advanced-all-prototype/site-intelligence-pillars-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/site-intelligence-pillars-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/site-intelligence-pillars-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/site-intelligence-pillars-390.png) |
| Site Intelligence · Señales SEO | [Adjunto](../../test-results/studio-advanced-all-prototype/site-intelligence-seo-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/site-intelligence-seo-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/site-intelligence-seo-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/site-intelligence-seo-390.png) |
| Site Intelligence · Páginas y rastreo | [Adjunto](../../test-results/studio-advanced-all-prototype/site-intelligence-crawl-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/site-intelligence-crawl-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/site-intelligence-crawl-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/site-intelligence-crawl-390.png) |
| Competidores · Competidores | [Adjunto](../../test-results/studio-advanced-all-prototype/competitors-shortlist-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/competitors-shortlist-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/competitors-shortlist-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/competitors-shortlist-390.png) |
| Competidores · Cobertura temática | [Adjunto](../../test-results/studio-advanced-all-prototype/competitors-coverage-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/competitors-coverage-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/competitors-coverage-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/competitors-coverage-390.png) |
| Competidores · Oportunidades | [Adjunto](../../test-results/studio-advanced-all-prototype/competitors-opportunities-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/competitors-opportunities-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/competitors-opportunities-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/competitors-opportunities-390.png) |
| Fuentes · Fuentes activas | [Adjunto](../../test-results/studio-advanced-all-prototype/sources-sources-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/sources-sources-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/sources-sources-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/sources-sources-390.png) |
| Fuentes · Recomendadas | [Adjunto](../../test-results/studio-advanced-all-prototype/sources-recommendations-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/sources-recommendations-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/sources-recommendations-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/sources-recommendations-390.png) |
| Fuentes · Añadir fuente | [Adjunto](../../test-results/studio-advanced-all-prototype/sources-add-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/sources-add-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/sources-add-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/sources-add-390.png) |
| Fuentes · Evidencias | [Adjunto](../../test-results/studio-advanced-all-prototype/sources-evidence-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/sources-evidence-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/sources-evidence-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/sources-evidence-390.png) |
| Fuentes · Diagnósticos y paquetes | [Adjunto](../../test-results/studio-advanced-all-prototype/sources-settings-1440.png) · [Studio](../../test-results/studio-sources-diagnostics-dev/studio-integration-accepta-9821b-t-desktop-and-mobile-widths/sources-settings-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/sources-settings-390.png) · [Studio](../../test-results/studio-sources-diagnostics-dev/studio-integration-accepta-9821b-t-desktop-and-mobile-widths/sources-settings-390.png) |
| Inbox · Historias | [Adjunto](../../test-results/studio-advanced-all-prototype/inbox-inbox-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/inbox-inbox-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/inbox-inbox-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/inbox-inbox-390.png) |
| Inbox · Clústeres | [Adjunto](../../test-results/studio-advanced-all-prototype/inbox-clusters-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/inbox-clusters-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/inbox-clusters-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/inbox-clusters-390.png) |
| Plan editorial · Backlog | [Adjunto](../../test-results/studio-advanced-all-prototype/plan-backlog-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/plan-backlog-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/plan-backlog-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/plan-backlog-390.png) |
| Plan editorial · Pipeline | [Adjunto](../../test-results/studio-advanced-all-prototype/plan-pipeline-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/plan-pipeline-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/plan-pipeline-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/plan-pipeline-390.png) |
| Cola de revisión · Pendientes | [Adjunto](../../test-results/studio-advanced-all-prototype/review-queue-pending-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/review-queue-pending-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/review-queue-pending-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/review-queue-pending-390.png) |
| Cola de revisión · Historial | [Adjunto](../../test-results/studio-advanced-all-prototype/review-queue-history-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/review-queue-history-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/review-queue-history-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/review-queue-history-390.png) |
| Biblioteca multimedia · Todos los recursos | [Adjunto](../../test-results/studio-advanced-all-prototype/media-all-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/media-all-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/media-all-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/media-all-390.png) |
| Biblioteca multimedia · Con errores | [Adjunto](../../test-results/studio-advanced-all-prototype/media-failed-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/media-failed-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/media-failed-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/media-failed-390.png) |
| Biblioteca multimedia · Sin utilizar | [Adjunto](../../test-results/studio-advanced-all-prototype/media-unused-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/media-unused-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/media-unused-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/media-unused-390.png) |
| Trabajos en segundo plano · En curso | [Adjunto](../../test-results/studio-advanced-all-prototype/activity-active-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/activity-active-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/activity-active-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/activity-active-390.png) |
| Trabajos en segundo plano · Historial | [Adjunto](../../test-results/studio-advanced-all-prototype/activity-history-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/activity-history-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/activity-history-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/activity-history-390.png) |
| Trabajos en segundo plano · Fallidos | [Adjunto](../../test-results/studio-advanced-all-prototype/activity-failed-1440.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/activity-failed-1440.png) | [Adjunto](../../test-results/studio-advanced-all-prototype/activity-failed-390.png) · [Studio](../../test-results/studio-advanced-all/studio-integration-accepta-38886-t-desktop-and-mobile-widths/activity-failed-390.png) |

Las cifras, estados y acciones se rigen por las API de Studio. La biblioteca enlaza al editor de artículos para generar recursos. Los detalles, formularios y filtros disponibles dependen de cada herramienta.

## Cotejo por pestaña de Settings

| Pestaña | Ruta | Referencia | Studio | Resultado | Cambios | Pruebas |
|---|---|---|---|---|---|---|
| Sitios · Sitios y destinos | `/studio/settings/sites?tab=list` | `test-results/settings-tab-acceptance/sites-ref-1440.png` · `sites-ref-390.png` | `sites-studio-1440.png` · `sites-studio-390.png` | Aceptada con desviaciones menores | Textos en español, KPI como la referencia, badges ámbar para estados sin verificar y badge en la tabla de conexión, fecha `d MMM y, HH:mm` | Capturas a 1440 y 390 px con la cuenta QA local, sin desbordamiento (scrollWidth 1440 y 390). La prueba E2E `studio-integration-acceptance` se actualizó a los nuevos textos y no se pudo ejecutar: su login contra el workspace temporal devolvió error. |

Desviaciones: el botón "Ver conexiones" no lleva el borde de la referencia, el eyebrow "Workspace settings" sigue en inglés (es compartido por todas las pestañas) y la referencia no tiene los estados de error, vacío y paginación que Studio añade.

| Sitios · Identidad del sitio | `/studio/settings/sites?tab=defaults` | `test-results/settings-tab-acceptance/identity-ref-1440.png` · `identity-ref-390.png` | `identity-studio-1440.png` · `identity-studio-390.png` | Aceptada con desviaciones | Título y subtítulo como la referencia, campos con borde, panel "Propiedad de los datos" añadido, acciones que pasan a otra línea a 390 px | Capturas a 1440 y 390 px con la cuenta QA local, sin desbordamiento. Sin prueba automatizada nueva. |

Desviación: Studio muestra la identidad como lectura con "Editar identidad" (flujo real con guardado y aviso de cambios), no como formulario siempre editable. El tipo de integración muestra el valor real (`guiatv`).

| Escritura · Instrucciones, Estructura y enlaces, Visuales, Llamadas a la acción, Negocio y ofertas, Marca y aviso | `/studio/settings/writing?tab=rules\|structure\|visuals\|ctas\|business\|brand` | `test-results/settings-tab-acceptance/writing-<pestaña>-ref-1440.png` · `-390.png` | `writing-<pestaña>-studio-1440.png` · `-390.png` | Aceptadas con desviaciones (se revisaron visualmente Instrucciones, Estructura y Marca; Visuales, Llamadas a la acción y Negocio solo con las capturas hechas, sin revisión detallada) | Página traducida al español (título "Estilo y contenido", textos, ayudas, avisos y mensajes). Las etiquetas que sirven de clave interna se renombraron a la vez. La prueba E2E de borradores por sitio usa los nuevos textos. | Capturas a 1440 y 390 px, sin desbordamiento en las seis. La prueba unitaria del componente y la E2E no se ejecutaron. |

Desviaciones de Escritura: Studio usa controles reales (extensión por tarjetas, interruptores de bloques, vista previa del resumen) y no los selectores simplificados de la referencia. Se conservan los enlaces a Competidores, Páginas guardadas y Días de publicación. El menú de cambio de sitio de la barra global sigue en inglés.

| Modo y ritmo · Modos de trabajo, Calendario y volumen, Seguridad y recuperación | `/studio/automation?tab=mode\|schedule\|safety` | `test-results/settings-tab-acceptance/automation-<pestaña>-ref-1440.png` · `-390.png` | `automation-<pestaña>-studio-1440.png` · `-390.png` | Aceptadas con desviaciones | Página y tarjeta de artículos traducidas al español (título "Automatización editorial", modos, límites, diálogos, mensajes). Días de la semana (`WEEKDAYS`) y fechas de los próximos huecos en español. Se actualizaron las pruebas E2E que usaban los textos antiguos. | Capturas a 1440 y 390 px, sin desbordamiento. Las E2E y la unitaria no se ejecutaron. |

Desviaciones de Modo y ritmo: la referencia muestra cuatro indicadores (modo actual, estado, aprobación, QA mínimo) y los modos con botón "Seleccionar"; Studio mantiene la cabecera de estado real y las tarjetas de modo seleccionables, y los umbrales de calidad siguen como JSON. Las E2E `home-article-m5` y `studio-role-separation` ya tenían aserciones desfasadas respecto a la navegación (p. ej. un checkbox "FAQ" que la tarjeta no tiene) y no se corrigieron.

| Conexiones · Destinos, Verificación y credenciales | `/studio/connections?tab=dest\|status` | `test-results/settings-tab-acceptance/connections-<pestaña>-ref-1440.png` · `-390.png` | `connections-<pestaña>-studio-1440.png` · `-390.png` | Aceptadas con desviaciones | Página, caja de conexión, filtros, tabla, estados, diálogos y mensajes en español; fecha `d MMM y, HH:mm`. La E2E de configuración de destino usa "Abrir configuración". | Capturas a 1440 y 390 px, sin desbordamiento. Las E2E no se ejecutaron. |

Desviaciones de Conexiones: la referencia muestra cuatro indicadores y una lista de tarjetas con "Verificar" y "Desconectar"; Studio conserva la tabla real con filtros, búsqueda y acciones por tipo de destino. Los valores técnicos de ciclo de vida y de verificación (`cancelled`, `ready`) llegan del servidor y se muestran sin traducir.

Corrección de Escritura · Instrucciones: las reglas llevan numeración ("1.", "2."), y cada una se puede editar en línea (Guardar, Cancelar, Intro y Esc) o eliminar. La edición evita duplicados y vacíos. Se añadió la ruta de navegación "Auctorio / Configuración / Estilo y contenido" dentro de la página. Se comprobó en el navegador con la cuenta QA local (alta, edición y eliminación de reglas) a 1440 y 390 px, sin guardar. No hay prueba automatizada nueva.

Corrección transversal de tablas: las tablas `au-table` (Conexiones, Operaciones, Fuentes y otras) no tenían marco ni fondo y la cabecera era blanca. Ahora usan marco de 1 px, esquinas de 12 px, cabecera tintada, líneas de fila suaves y resaltado de fila al pasar el cursor, con los colores de la referencia. Los colores son variables (`--au-table-head`, `--au-table-head-text`, `--au-table-row-line`, `--au-table-row-hover`) con valores para tema claro y oscuro. Las tablas de Sitios y de la matriz de permisos (`sites-table`) usan las mismas variables. Capturas: `test-results/settings-tab-acceptance/tables-*-1440.png`. El tema oscuro no se revisó visualmente.

Escritura · Llamadas a la acción (mejora): elección entre cuatro estilos de tarjeta (Clásico, Suave, Minimalista, Destacado) y esquinas redondeadas o rectas, guardados en `articleTargets.brand` (`cardStyle`, `cardCorners`). La vista previa de las tres tarjetas se renderiza en la página con el mismo generador y saneador que los artículos (`POST /v2/sites/:id/cta-preview`) y se actualiza al cambiar cualquier campo; hay un desplegable con el HTML. Comprobado en el navegador con la cuenta QA local (Clásico y Destacado, 1440 px): la vista previa responde 200 y muestra las tres tarjetas. Test `tests/brand-cards.test.ts`: 7 de 7. No se comprobó Suave y Minimalista en pantalla, ni 390 px, ni cómo las muestra el sitio de destino real.

Escritura · Llamadas a la acción (revisión de estilos): el selector de estilo es un desplegable con siete estilos preconfigurados (Clásico, Editorial, Suave, Minimalista, Destacado, Oscuro, Marco centrado) y otro desplegable de esquinas (el Editorial no las tiene). Se retiró el HTML visible: queda solo la vista previa. Los estilos usan solo las propiedades CSS que conserva el saneador. Comprobado en el navegador con la cuenta QA a 1440 px: los siete estilos cambian la vista previa. Test `tests/brand-cards.test.ts`: 7 de 7, con los 13 resultados distintos entre estilos y esquinas.

Ajuste de estilos de tarjetas: en Suave y Oscuro el borde de acento ya no se estrecha en las esquinas (esquinas redondeadas solo en el lado opuesto al acento), y la vista previa alinea las tarjetas arriba con menos margen. Comprobado en el navegador a 1440 px (Suave, Oscuro, Clásico, Minimalista) y a 390 px (Marco centrado, Editorial), sin desbordamiento. Test `tests/brand-cards.test.ts`: 7 de 7.

Escritura · Marca y aviso (rastreo real del sitio): la pestaña muestra "Detectado en tu sitio" con la URL leída, el logotipo y los colores primario y secundario que el servidor extrae de la página de inicio y su hoja de estilos (`GET /v2/sites/:id/brand-detected`; `POST .../brand-detected/refresh` vuelve a leer el sitio y exige `projects.manage`). Los campos vacíos muestran lo detectado como valor por defecto y como muestra de color, y "Usar los datos detectados" lo copia a los campos. La vista previa de las tarjetas aplica la misma precedencia que la producción de artículos (lo guardado en Marca gana; lo vacío toma lo detectado). Comprobado con guiaprogramaciontv.com: primario #1ed760, secundario #121212 y su logotipo, reflejados en las tarjetas. No se comprobó el botón "Volver a leer el sitio" ni 390 px.

Modo y ritmo (artículos web primero): la página muestra cuatro indicadores reales (modo actual, estado, artículos de hoy y próximo hueco) y queda centrada en artículos del sitio web. Se ocultaron los ajustes de X e Instagram (publicaciones por día, retrasos, máximo social, publicaciones sociales por hora), las ventanas y huecos de esos canales y las cuentas sociales, que se sustituyen por un aviso con enlace a Conexiones; los valores guardados de esos campos no se modifican. Los días activos y los de cada ventana son botones con nombre (lunes primero), las ventanas se muestran como filas con marco y la pestaña de seguridad separa sus bloques. Comprobado en el navegador con la cuenta QA: guardar artículos por día y un día activo persiste tras recargar (valores restaurados después). Sin comprobar: cambio de modo, pausa, simulacro y recuperación, ni 390 px en las tres pestañas.

Modo y ritmo · Modos de trabajo (descripción y plan por palabras clave): cada modo describe paso a paso lo que hace, con los valores reales de la política. El plan por palabras clave aparece como flujo principal y las fuentes de noticias como flujo complementario. El panel "Qué está pasando ahora" (`pipeline` del estado de automatización) muestra elementos del plan por redactar, artículos esperando revisión, fuentes y noticias candidatas, las próximas palabras clave con fecha y volumen medido, si el proveedor de palabras clave está configurado, y enlaces para añadir palabras clave y generar el plan del mes. Comprobado en el navegador con la cuenta QA: GuiaProgramacionTV no tiene palabras clave con fecha futura, y el panel lo indica. Sin comprobar con un plan con palabras clave futuras, ni a 390 px.

### Modo y ritmo › Plan del mes (23/11/2026)

- **Pestaña nueva** (la referencia no la tiene; pedida por el usuario): `/studio/automation?tab=plan`. El menú de Configuración pasa de 25 a 26 pestañas.
- **Autopilot** mantiene 30 días planificados (`src/studio/autopilot-plan.ts`, llamado en `runAutomationTick`). Un plan por mes natural; una generación a la vez; máximo 3 fallos al día separados 1 h; respeta presupuesto, pausa, días activos y ventanas. Manual/Asistido solo con el botón. El flujo de fuentes no cambia.
- **Por qué**: cada generación guarda la investigación en `EditorialPlan.generatedOutput.keywordResearch` y el motivo en `EditorialPlanItem.metadata.selection` (sin migración). Se muestra en la pestaña y en el drawer del brief. Los planes anteriores no tienen registro y la pantalla lo dice.
- **Cambiar palabra** (pestaña y Calendario): mismo hueco, limpia el brief anterior, guarda historial, 409 si ya se redacta, 400 si choca con otra palabra del plan.
- **Corregido al probar**: el ciclo de automatización ignoraba el modelo del workspace (usaba el simulado); la misma palabra podía repetirse entre lotes y entre meses; el KPI "Próximo hueco" no coincidía con el plan.
- **Verificado en navegador** (GuiaProgramacionTV, 1440 y 390): 29 huecos → 29 artículos (7 nov + 22 dic), relleno de 3 huecos borrados sin repeticiones, "Por qué", cambio de palabra con historial tras recargar, drawer, 29 elementos en Calendario, sin errores de consola salvo el 400 esperado.
- **No demostrado**: palabras medidas. DataForSEO devolvió 402 (sin saldo) y Anthropic sin crédito (respaldo DeepSeek): las 29 palabras las propuso la IA y salen como "Sin medir". Desglose, alternativas y descartes solo están cubiertos por pruebas automáticas. Tampoco se observó una generación iniciada por el ciclo de Autopilot con éxito (el primer intento falló con el proveedor simulado; las buenas se lanzaron con el botón), ni tema oscuro, ni un cambio aceptado desde Calendario (solo el rechazo por duplicado).
- **Limitación**: una palabra ajena al sitio escrita a mano puede aceptarse ("receta de paella valenciana" pasó el filtro con el perfil real; es el mismo criterio permisivo de "Añadir palabras clave").
- Pruebas: `autopilot-month-plan` 10/10, `editorial-plan-v2` 18/18, `autopilot-planner` 8/8, `planning-workspace` 8/8, `keyword-candidates` 6/6, `keyword-metrics` 3/3, `plan-keywords` 1/1, `plan-slots` 15/15, `studio-nav.spec` 6/6.
