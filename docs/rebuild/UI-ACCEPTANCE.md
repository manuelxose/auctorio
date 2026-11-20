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
