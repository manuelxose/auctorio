# Seguridad y RBAC

## Permisos de sistema

| Permiso | Owner | Admin | Editor | Reviewer | SEO Manager | Publisher |
| --- | --- | --- | --- | --- | --- | --- |
| `workspace.manage` | ✓ | ✓ | | | | |
| `users.manage` | ✓ | ✓ | | | | |
| `roles.manage` | ✓ | ✓ | | | | |
| `prompts.manage` | ✓ | ✓ | | | ✓ | |
| `projects.manage` | ✓ | ✓ | ✓ | | ✓ | |
| `review.approve` | ✓ | ✓ | | ✓ | | |
| `publishing.manage` | ✓ | ✓ | | | | ✓ |
| `integrations.manage` | ✓ | ✓ | | | | ✓ |
| `analytics.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Un miembro activo recibe la unión de permisos de sus roles. La API consulta de nuevo afiliación, cuenta, sesión y permisos del actor dentro de la transacción de cambio. Para actuar sobre un rol o un miembro, el actor debe poder delegar sus permisos. La asignación y gestión de Owner requieren otro Owner o una operación autenticada con la clave de workspace bajo el contrato vigente. Los roles de sistema son inmutables.

## Integridad

- Las escrituras de roles, invitaciones, membresías y auditoría comparten una transacción serializada por fila de workspace. Las consultas de objetivos y roles están acotadas al tenant. Se conservan el último Owner activo y el último miembro activo que reúne `users.manage` y `roles.manage`, incluso si esos permisos proceden de varios roles.
- Una invitación nueva requiere un miembro inexistente o en estado invitado. El resultado distingue envío, fallo y falta de transporte. Una suspensión revoca sesiones en la misma transacción. Reducir permisos se refleja en la siguiente solicitud validada. Los inicios de sesión comprueban el estado actual antes de volver activa una membresía o emitir la sesión.
- La plataforma conserva su autorización independiente. Las pruebas incluyen la matriz de acceso a endpoints de workspace. Queda pendiente la aceptación integrada de plataforma con identidades reales de prueba.

## Evidencia y pendientes

`tests/studio-access-mutations.test.ts` comprueba denegaciones por delegación y tenant, roles inmutables, autosuspensión, último Owner, concurrencia y reducción o revocación. `tests/studio-ssr.test.ts` comprueba que el proxy propaga permisos vigentes y rechaza sesiones revocadas. Playwright verificó que una suspensión desde Personas revocó una sesión abierta de Editor. La validación de todos los caminos de aprovisionamiento OIDC, límites de plataforma, migraciones heredadas, entrega SMTP y revisión de acceso a credenciales debe completarse antes del lanzamiento.
