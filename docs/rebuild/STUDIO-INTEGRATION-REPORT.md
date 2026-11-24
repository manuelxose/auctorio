# Integración de Auctorio Studio

**Integración parcial.** La rama `feat/studio-settings-advanced-integration` parte de `feat/social-m4-x`, en `4b720b0`, con cambios locales previos. El trabajo se hizo sobre el checkout activo en `Documents/workspace/auctorio`.

El paquete adjunto contiene dos prototipos HTML/CSS/JS, tres documentos y cuatro capturas. Se contrastaron con el router, los servicios Angular y las rutas de API del repositorio. Los estados, acciones y contadores del prototipo son referencias de diseño.

## Cambios integrados

- **Sitios.** Resumen paginado y contadores, conexión y última comprobación registradas, edición del nombre y la configuración regional, selección de sitio y borrado con confirmación. Conexiones conserva la configuración y la comprobación del destino.
- **Personas y roles.** Búsqueda, filtro, invitación multirrol, asignación y retirada, suspensión y reactivación, consulta y comparación del acceso, matriz de nueve permisos y alta, copia y edición de roles personalizados.
- **Navegación.** El registro existente alimenta guard, menú y buscador con permisos efectivos de la sesión. Advanced conserva sus ocho herramientas. Competidores e Inbox incorporan enlaces directos a sus vistas y respetan Atrás/Adelante. El inventario de páginas indica cuándo Auctorio intentó rastrearlas.
- **Backend y sesión.** Los cambios de acceso comparten una transacción por workspace y escriben auditoría. El servidor web vuelve a validar permisos y revocación en cada solicitud. La vista de sesión refresca el inventario al añadir o quitar sitios.

Se reutilizaron el shell, el router, los servicios Angular, los modelos de persistencia, la verificación de destinos, las confirmaciones y las notificaciones existentes. Este incremento no requiere cambios de esquema. La matriz de paridad recoge las funciones heredadas y su nivel de verificación.

El commit `3f9ab7a` contiene el incremento de API, sesión y pruebas de seguridad. Los archivos Angular compartidos con modificaciones locales previas conservan los cambios en el árbol de trabajo.

## Fase C · Escritura (§7.2)

El formulario sigue el sitio activo. Mantiene separados los borradores de cada sitio mientras la página está abierta y descarta las respuestas de carga obsoletas. La escritura de planificación actualiza solo los campos enviados y registra la auditoría en la misma transacción.

Los valores guardados llegan al redactor y a QA. El rango explícito de un artículo planificado tiene prioridad sobre el valor del sitio y se conserva para la reevaluación tras las imágenes. Las guías respetan las opciones de resumen, tarjetas, enlaces y FAQ según su plantilla. Las reglas, el aviso, el contexto de marca y la longitud se transmiten a la generación. La prueba de producción comprobó que guardar los ajustes conserva intactas las versiones anteriores.

## Fase C · Automatización y publicación (§7.3)

Modo y ritmo muestra el modo confirmado, la selección pendiente, la cadencia y las ventanas. Los controles avanzados agrupan QA, recuperación y seguridad. Inicio y Calendario muestran el modo y el estado de ejecución que devuelve la política del sitio.

Guardar el modo conserva una pausa. Manual desactiva la automatización. Un circuito abierto bloquea reanudación y autopublicación. Tras cerrarse el circuito, reanudar restaura las capacidades de Autopilot y conserva el límite de reparaciones. Los endpoints comprueban que el sitio pertenece al workspace.

Los huecos de política respetan la zona horaria, los días y varias ventanas. La previsión social aplica los cupos y ventanas de cada canal. El planificador comprueba los límites del sitio antes de crear publicaciones automáticas y deja la pieza pendiente si no encuentra una franja válida. Los huecos de previsión y las publicaciones efectivamente programadas se muestran en sus pantallas respectivas.

La recuperación respeta el estado pausado y el circuito. El resultado distingue una publicación previa de una pieza sin franja disponible. La prueba local cubrió ambas situaciones con registros temporales.

## Fase C · Conexiones (§7.4)

Conexiones reúne destinos web e identidades sociales en una sola vista. Distingue el estado de la instalación, la presencia de credenciales y la verificación vigente. La interfaz muestra los errores por fuente, aplica los permisos de gestión y enlaza la recuperación de instalaciones con el asistente.

La comprobación de un destino activo registra su resultado sin sacarlo de servicio. Reemplazar las credenciales de una instalación pendiente exige verificar de nuevo antes de activarla. Al sustituir un conector REST genérico, la activación actualiza el adaptador del sitio en la misma transacción.

Desconectar un sitio conserva su historial y bloquea nuevas entregas, incluidas las que estaban en cola y las que podían recurrir a una credencial heredada. Las llamadas al proveedor ya iniciadas pueden finalizar. Las respuestas de instalaciones omiten credenciales y detalles internos de los errores. La verificación local utilizó proveedores simulados.

## Rediseño de interfaz · Primera entrega

El prompt maestro marca el §7.5, Descubrimiento web, como pendiente para retomarlo después del rediseño. Esta entrega aplica el marco visual de los prototipos de Configuración y Advanced a los componentes existentes de Angular. La navegación contextual usa el registro de Studio y ofrece selectores de herramienta y sección en móvil. En escritorio, las dos áreas se enlazan en la barra lateral.

Sitios, Personas y Roles incorporan las tarjetas, superficies y estados de la referencia. Las cifras de Personas proceden del directorio del workspace. La interfaz conserva la barra global de Studio y deja el asistente cerrado por defecto en estas áreas cuando no hay una preferencia guardada.

Los formularios de invitación y roles siguen en línea. La adaptación detallada de los subpaneles de Advanced queda para las siguientes entregas.

## Rediseño de interfaz · Navegación y subvistas

La barra lateral sigue el orden, las agrupaciones y los rótulos de Settings y Advanced de los dos prototipos. Configuración muestra nueve herramientas y 25 subvistas de workspace. Advanced muestra ocho herramientas y 24 subvistas. Administración global añade tres destinos a usuarios con acceso de plataforma. Ambos menús y los selectores móviles se construyen desde el mismo registro.

| Función reubicada | Acceso en Studio |
| --- | --- |
| Ajustes de redes | Conexiones → Ajustes de redes. El enlace directo se conserva. |
| Workers y colas | Salud del sistema → Workers y colas. Los enlaces antiguos de workers, colas y costes se conservan. |
| Producción y fallos | Salud del sistema → Estado general conserva las tablas y acciones. Las rutas antiguas siguen abriendo su panel. |
| Administración global | Una entrada para Workspaces, Proveedores IA y Uso global. Las tres rutas originales se conservan. |
| Diagnósticos y paquetes | Advanced → Fuentes reúne las herramientas técnicas existentes. |
| Auditoría | El pie de Configuración abre el historial paginado del workspace con permiso workspace.manage. |

Sitios incorpora Identidad del sitio. Personas separa Miembros de Invitaciones y abre el formulario en un diálogo. Roles y permisos separa biblioteca, matriz y simulación. Conexiones muestra el estado y las credenciales de todos los destinos en su subvista de diagnóstico. La política y los límites de Descubrimiento web separan los campos ya existentes. La integración funcional del §7.5 sigue pendiente en el prompt maestro.

Cola de revisión y Trabajos en segundo plano filtran en el servidor antes de paginar. Biblioteca multimedia conserva acciones y usa sus filtros por estado y uso. El enlace heredado a trabajos fallidos conserva el filtro. La barra global de Studio sigue disponible.

## Rediseño de interfaz · Personas

El directorio separa identidad, último acceso, estado y acción por persona. Gestionar acceso abre un diálogo con nombre, correo de solo lectura, estado, roles disponibles y el permiso efectivo resultante. La API guarda los cambios de nombre, estado y roles en una transacción de workspace, con delegación y protección del último administrador. El bloqueo de acceso conserva la confirmación y revoca las sesiones activas.

La lista de invitaciones pendientes muestra las asignaciones reales y permite revocar una invitación con confirmación. La revocación se audita y suspende la membresía pendiente en ese workspace. Cada nueva invitación tiene un enlace propio. Reinvitar genera otro enlace, y los enlaces globales heredados siguen limitados a las membresías con acceso previo o invitación heredada. OIDC acepta la invitación con el correo verificado por el proveedor configurado.

El §7.5, Descubrimiento web, conserva su marca de pendiente en el prompt maestro.

## Rediseño de Advanced · Site Intelligence y Competidores

Perfil y estrategia usa dos columnas en escritorio. La principal contiene la identidad detectada y el formulario de estrategia. La lateral reúne los ajustes relacionados, el historial restaurable y las cifras de evidencia. En móvil los bloques se apilan. Páginas y rastreo resume por separado las URL descubiertas, consultadas, analizadas y fallidas, y conserva el inventario enlazado.

Competidores incorpora indicadores de seguimiento, tarjetas de la lista y búsqueda por texto. La vista de cobertura conserva su matriz y explica de dónde sale la muestra. Oportunidades añade búsqueda y filtro por estado sobre los registros del sitio y conserva sus acciones para planificar, vigilar o descartar. Ambas pantallas usan las API existentes.

## Advanced · Fuentes a Trabajos en segundo plano

Se integraron seis pantallas y sus enlaces existentes en el orden de `advanced.html` y `advanced.js`.

- **Fuentes.** Registro en tabla con alcance, verificación, errores, referencias y detalle desplegable. Conserva la vista de tarjetas, la selección múltiple, las pruebas de extracción y la configuración. El alta sitúa la guía y los paquetes junto al formulario en escritorio.
- **Inbox.** Resumen de la consulta, lista de historias con filtros y vista de clústeres. Conserva la procedencia, las decisiones editoriales y el panel de detalle.
- **Plan editorial.** Indicadores del plan activo, backlog y tablero con columnas desplazables. Usa los estados del plan y conserva el vínculo al Calendario.
- **Cola de revisión.** Aviso sobre el paso de propuesta a artículo, resumen y panel de pendientes o historial. Conserva revisión, QA y evidencia.
- **Biblioteca multimedia.** Galería de cuatro, tres o dos columnas, según el ancho. La búsqueda actúa sobre los recursos cargados. Las miniaturas reales usan los archivos correspondientes y los recursos sin imagen tienen un marcador visual.
- **Trabajos en segundo plano.** Indicadores agregados del backend y tabla con filtros, progreso y acciones. El historial y cada estado se filtran en el servidor antes de paginar.

El CSS toma las dimensiones y puntos de quiebre del adjunto. La cabecera global y los controles de Studio siguen disponibles. Los indicadores de Inbox, revisión y multimedia identifican si su alcance es el resultado filtrado o los registros cargados. El §7.5 de Descubrimiento web sigue marcado como pendiente en el prompt maestro.

## DataForSEO · Sin continuar (24/11/2026)

La integración actual se queda como está y no se sigue desarrollando: se va a cambiar.

- **Sin saldo:** el proveedor rechazó todas las consultas del 23/11 (HTTP 402), así que el plan mensual no se pudo probar con palabras medidas.
- **Resultado en GuiaProgramacionTV:** las palabras del plan las propuso la IA (una se cambió a mano) y aparecen como "Sin medir".
- **Sin demostrar con datos reales:** puntuación y su desglose, alternativas, descartes y dificultad alcanzable. Solo los cubren pruebas automáticas.
- **Mientras tanto:** si no hay datos, el plan se genera igual con palabras de la IA y la pantalla avisa del motivo.

Código que toca el cambio: `src/infrastructure/seo/dataforseo.ts` (cliente), `keyword-candidates.ts` y `keyword-metrics.ts` (plan), `serp-sources.ts` y `youtube-videos.ts` (redacción), y los usos de `dataForSeoConfigured` en `src/studio`.
