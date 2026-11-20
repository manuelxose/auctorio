# Preparación de lanzamiento

**NO-GO para producción.** Las pruebas dirigidas cubren los incrementos de Settings, Escritura y Automatización. Falta la cobertura necesaria para aceptar la reconstrucción completa de Studio.

## Migración y configuración

La rama no añade migraciones. Preproducción debe tener el esquema existente al día. El servidor web y la API deben compartir `STUDIO_PROXY_SHARED_SECRET` y desplegarse juntos para que el inventario de sitios y permisos procedan del mismo contrato. Validar PostgreSQL, Redis, correo y credenciales de destino con los valores del entorno correspondiente.

## Paso de entrega y reversión

1. Aislar una base de datos y un workspace de aceptación. Ejecutar preflight, regresión de backend, Angular, SSR y recorridos de navegador.
2. Completar la matriz con evidencia reproducible del recorrido editorial, cambios de acceso y publicación en destinos controlados.
3. Con autorización de despliegue, actualizar API y servidor web coordinadamente, verificar acceso, cambios de sesión e inventario, y revisar auditoría.
4. Para revertir, desplegar conjuntamente las versiones previas de API y servidor. Los cambios de configuración y acceso que hayan sido persistidos permanecen y se revisan mediante auditoría.

## Bloqueos

- Paridad y aceptación completas de Settings y Advanced, incluidas invitaciones, accesibilidad y todas las integraciones.
- Recorrido editorial completo con generación, QA, revisión, calendario, publicación y resultados.
- Verificación operativa de aprovisionamiento y permisos de plataforma, SMTP, proveedores y trabajadores en preproducción.
