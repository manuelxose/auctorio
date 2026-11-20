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
