# Studio rebuild — auditoría y prompts
Base inspeccionada: main 173ecf037 (GitHub, 2026-11-13).
**Estado del informe: PARTIAL** por falta de navegador local, consultas DB y ejecución de pruebas. No tomar hipótesis de comportamiento como observación real.

Leer en orden: 00 executive -> 01 architecture -> 02/03 screens/UX -> 04 ownership -> 05 GuíaTV -> 06 modes -> 07 publication -> 08 SEO -> 09/10 target -> 11 roadmap -> 12 acceptance. El índice ejecutable de hitos está en prompts/INDEX.md.

Hallazgos que cambian la estrategia:
- Tres modos presentes en código; la UI los ofrece pero su discoverability y semántica necesitan verificación real.
- Overview solo lee PublishingAccount, el wizard activa ConnectorInstallation/Site.
- Ya existe pipeline unificado de producción, calendario-proyección y copilot; conservarlos.
- E2E local GuíaTV del 12-11 reportó problemas de crawl, fuentes, planificación, idioma/estructura e imagen.

**Primero STUDIO-01** para verificar el entorno real y validar los puntos que GitHub no puede resolver. Seguir dependencias; nunca publicar/desplegar sin autorización.
