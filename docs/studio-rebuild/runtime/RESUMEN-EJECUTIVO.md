# STUDIO-01: resumen ejecutivo (2026-11-13)

**Estado:** hito de evidencia completado salvo lo declarado BLOCKED/PARTIAL. No se cambió código de producto.

- **Commit auditado:** `1961e36` en `feat/editorial-operating-system` (3 commits y 81 archivos por delante de `main` `173ecf0`).
- **Entorno:** base local reconstruida desde cero, API + 9 workers + Studio; cuenta QA local; DeepSeek real con clave de prueba (en `.env`, no en git).
- **Evidencia:** 24 capturas (1440/1024/390 × 8 pantallas) en `runtime/screens/`, mapa de red, matriz de estado, tabla confirmado/desconocido y matriz de aceptación en `docs/studio-rebuild/runtime/`.
- **Comprobaciones:** typecheck y build OK; tests unitarios 465/467 (fallos distintos y no deterministas en cada pasada); e2e 16 pasan, 7 fallan, 3 saltados (la mayoría por IA real/especificaciones desactualizadas); nada publicado.
- **Causas raíz confirmadas (sin arreglar):** PNG de relleno del proveedor de imagen simulado corrupto; un tenant sin sitios no puede iniciar sesión; `npm test` se cuelga; el control de calidad rechaza el artículo de DeepSeek (71 < 75, afirmaciones sin respaldo).
- **Veredictos:** IMPLEMENTATION PASS · FUNCTIONALITY, UX/UI, SECURITY, INTEGRATION, REGRESSION PARTIAL · ACCESSIBILITY y PRODUCTION READINESS BLOCKED.
- **Fuera de alcance / no hecho:** revisión independiente (por indicación), accesibilidad, despliegue de claves en producción, recorrido completo botón→base de datos.
- **Siguiente:** STUDIO-02 (ver `acceptance-matrix.md`).
