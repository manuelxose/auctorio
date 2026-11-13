# GuíaTV: diagnóstico de conexión
Site: https://guiaprogramaciontv.com. No exponer credenciales.

## Hecho de código confirmado
- GET /v2/overview en src/studio/routes-editorial.ts:2155-2304 consulta prisma.publishingAccount.findMany({where:{tenantId}}) y mapea sólo esas filas como connections.
- Activation de website en src/studio/routes-connectors.ts:450-579 crea/recupera prisma.site y marca ConnectorInstallation como active, pero NO crea PublishingAccount website en ese bloque.
- ConnectorInstallation guarda ciphertext cifrado (src/studio/connectors/installation.ts:230+) y loadActiveInstallationForSite resuelve instalación activa (línea 360+).
- Overview-page.component.ts:376-399 considera websiteConnected por connections.platform==='website', enabled y status active o connected; connectionState(): status active basta para mostrar Connected. Distinguir activación vs autenticación/permiso/capacidad.
- La lista de sitios en session es independiente del status de destino: AppContextService lee session.sites.

## Evidencia runtime histórica, no actual
docs/acceptance/guiatv-local-2026-11-12.md: en tenant local auctorio inicialmente NO había Site GuíaTV; se creó Site de prueba sin publishing credentials. El paso destination draft quedó BLOCKED por ausencia GUIATV_AUCTORIO_ADMIN_KEY. No extrapolar esa DB de prueba a la sesión normal del usuario.

## Hipótesis a comprobar
H1: instalación moderna activa sin PublishingAccount omitida por overview.
H2: token almacenado en un tenant/site distinto del sitio seleccionado.
H3: credentialRef de Site resuelto distinto del secreto cifrado en instalación.
H4: token válido para autenticación pero insuficiente para publicar/draft.
H5: estado cacheado o antigua sesión.
H6: sitio y destino representados por registros diferentes con ciclo inconsistente.

## Diagnóstico autorizado P0
Consultar SOLO metadatos sanitizados: session.activeSiteId/tenantId, Site (id,type,baseUrl,credentialsRef-presence), ConnectorInstallation (state,siteId,provider,verifiedAt,secret-present,capabilities), PublishingAccount (platform,status), policy, operación de verificación y último intento. Nunca volcar ciphertext/token/env. Contrastar GET /v2/connector-installations, /v2/sites, /v2/overview. No forzar publicación real. Probar verify de lectura segura (capabilities) en test. Implementar un UnifiedDestinationReadModel con estados configured/authenticated/reachable/write_capable/ready/lastPublished, timestamps y causas; usarlo en Connections y Overview, no inferir ready de active. Tests: installation-only website, legacy website account, multi-tenant, revoked key, unreachable, unsupported scopes, stale verification y idempotent activation.
