# Roadmap de implementación — secuencia condicional
Orden recomendado y archivos de prompt completos en prompts/INDEX.md. No hacer merge ni deploy sin autorización.

| Hito | P | Dependencias | Resultado |
|---|---|---|---|
| STUDIO-01 | P0 | ninguna | Confirmación local navegador/DB/evidencias y baseline |
| STUDIO-02 | P0 | 01 | GuíaTV connections y readiness verídicos en Overview |
| STUDIO-03 | P0 | 01,02 | Tres modos atómicos y descubiertos, permiso y gates |
| STUDIO-04 | P1 | 01 | Crawl estratificado y Site Intelligence fiable |
| STUDIO-05 | P1 | 04 | Sources y competidores relevantes con procedencia |
| STUDIO-06 | P1 | 04,05 | Editorial Plan completo y briefs conectados |
| STUDIO-07 | P1 | 06 | Pipeline contenido, writer localizado, imágenes/QA |
| STUDIO-08 | P1 | 02,03,07 | Publicaciones, retries y Calendar canónico |
| STUDIO-09 | P1 | 01,02 | Shell doble nav, assistant, UX/UI y simplificación |
| STUDIO-10 | P1 | 03,05,09 | Admin vs cliente, settings y operaciones |
| STUDIO-11 | P0 | 02-10 | E2E integral y revisión independiente |

Paralelo: STUDIO-04 y STUDIO-02 después de STUDIO-01; STUDIO-09 puede investigar en paralelo y aterrizar tras contratos de 02; STUDIO-05 y 03 tienen superficies distintas. Secuencial: 04 -> 05 -> 06 -> 07 -> 08 y 02 -> 03 -> 08. Separar worktrees por grupo, no editar archivos comunes a la vez; integración controlada y PR independiente. GATE: no habilitar autonómica real ni publicar artículo a GuíaTV en estas fases sin permiso específico.

Primer prompt: STUDIO-01: runtime local aún sin verificar, completar baseline y diagnosis; el siguiente hito usa su evidencia en lugar de imaginar estados.
