# SEO-V2-03 — Conocimiento SEO persistente y motor de investigación adaptativo

Fecha: 2026-11-25. Rama: `feat/seo-v2-03-persistent-knowledge`, creada desde `origin/main` (`0d0bf8d`). Se hizo después de SEO-V2-04, que ya estaba aceptado.

## Veredicto: PASS, con restricciones

Se cumplen los criterios de aceptación, probados sobre PostgreSQL real con respuestas de proveedor simuladas; ninguno exige una llamada real y no había presupuesto para
hacerla. Restricciones: el motor **no se ha ejecutado nunca con un proveedor de pago real**, la investigación desatendida queda **apagada por defecto** y faltan CI y
fusión en `main`.

## Qué se ha implementado

- **Conocimiento**: historial de métricas por palabra, mercado, proveedor y método, con procedencia por campo, calidad, licencia y retención. Lo escribe el gestor
  con cada compra, la pida quien la pida. Palabras de cada sitio con todos sus orígenes (semilla, tema, competidor con su posición, posicionamiento propio).
- **Gobierno de datos**: lo de mercado y lo privado están en tablas distintas. Compartir entre workspaces exige el interruptor de la plataforma y una licencia que
  permita guardar y compartir: hoy ningún proveedor la tiene. Borrar Search Console borra también lo que el perfil y las investigaciones citaban de él.
- **Perfil de investigación**: los siete tipos de sitio, negocio, oferta, ingresos, público, idiomas, mercados, contenido, sitemaps, enlaces, entidades, cobertura,
  competidores, temporada, ritmo y datos propios. Cada dato dice quién lo afirma. Lo corregido por una persona manda siempre y llega al plan y al análisis.
- **Reserva de oportunidades** sobre `content_opportunities`: once estados y niveles de enriquecimiento 0–5 deducidos de lo guardado; cobertura en días, temas, mercados,
  frescura, confianza y lagunas. Reserva atómica para un solo artículo, variantes incluidas. Las oportunidades sobreviven a los planes.
- **Disparadores**: mercado, tema o competidor nuevos, temporada, cambio del tráfico propio, datos antiguos, falta de oportunidades, plan pendiente o una persona. Cada
  motivo se investiga una vez. Cambiar de mes no es un motivo.
- **Ejecuciones duraderas**: tareas como puntos de control, progreso, pausa, reanudación, cancelación, reintento, estimación, gasto real, motivo de cada compra y parada
  anticipada. La última comprobación antes de enviar exige que la investigación siga en marcha.
- **Planificar ya no compra**: usa la reserva y lo guardado. Si no basta y no se ha investigado hace poco, pide una investigación, espera 90 s como máximo y sigue.
- **Alta del sitio**: paso `research`, una sola vez por sitio.
- **Studio**: `/studio/seo-research` (Avanzado → Investigación): reserva, ejecuciones, controles, perfil y límites.

## Decisiones y supuestos

- Seis tablas nuevas; las otras nueve entidades conceptuales ya existían. Correspondencia en [architecture.md](../architecture.md).
- Sin columna de estado del ciclo de vida: sería una segunda verdad junto a los estados de SEO-V2-04.
- **La investigación que nadie pide está apagada** (`automaticResearch`, Proveedores SEO): el entorno tiene credenciales reales y habría empezado a comprar al arrancar.
  El alta, un plan sin conocimiento suficiente y lo que pide una persona no la necesitan.
- Límites por defecto: 2 lotes de semillas, 2 de dominios, 1 de métricas, 3 consultas SERP, 0,25 USD por ejecución, 75 días de cobertura, calidad mínima 40.
- El posicionamiento del propio dominio solo se compra sin Search Console, y cuenta entre los lotes de competidores.
- Sin precio conocido no hay consultas SERP: hoy no se hace ninguna.
- El rastreo se reutiliza; no se inicia. Un plan puede usar candidatas por debajo de la calidad mínima, siempre después de las mejores.

## Cambios de comportamiento

1. El plan deja de medir las palabras que inventa el modelo: esperan a un lote de métricas (mínimo 5).
2. Una oportunidad cuyo artículo se borra o cancela vuelve a estar abierta; si una persona lo rechaza, se descarta.
3. Elegir una palabra a mano retira su oportunidad de la reserva.
4. El alta tiene un paso más.

## Archivos y migraciones

- Migración aditiva `20261125120000_seo_persistent_knowledge`: seis tablas y columnas opcionales en `content_opportunities` y `seo_spend_reservations`.
- Nuevos: `src/studio/seo-research/` (`knowledge`, `policy`, `profile`, `reservoir`, `triggers`, `runs`), página y prueba de Studio, `tests/seo-research.test.ts`.
- Modificados: gestor, gobernador, caché y política SEO, `keyword-candidates.ts`, `editorial-plan.ts`, `editorial-plan-context.ts`, `plan-item-keyword.ts`,
  `plan-keywords.ts`, `seo-intelligence/`, `search-console.ts`, rutas, trabajador de control, alta, navegación y panel de Proveedores SEO.

## Pruebas

| Comprobación | Resultado |
|---|---|
| 47 migraciones y `migrate diff` | Sin diferencias |
| Typecheck, build y build de Studio | Correctos |
| Suite de backend, en serie | 739 de 739 |
| Specs de Studio (Karma) | 50 de 50 |
| Dev real, `http://localhost:4420`, 1280 y 375 px | Estimar, empezar (lo ejecutó el trabajador), detalle y corregir el perfil persisten; sin desbordes |

En el dev se usó un mercado no admitido para que no pudiera gastar. Pausar y reanudar desde la pantalla solo está probado por API y en la prueba de componente: la ejecución
terminaba antes.

Defectos encontrados y corregidos durante el hito: las consultas SERP sin precio dejaban toda ejecución como «parcial»; las cifras propias quedaban en el perfil tras borrar
Search Console; las evaluaciones se leían como lista y son un objeto; la investigación desatendida habría gastado al desplegar.

## Aceptación

| Criterio | Estado |
|---|---|
| La investigación no depende de generar planes | Cumplido |
| Las oportunidades sobreviven a sesiones, despliegues y planes | Cumplido, con prueba |
| Se reutilizan las métricas válidas | Cumplido, con prueba |
| Repetir el alta no repite la investigación | Cumplido, con prueba |
| La reserva se repone de forma selectiva | Cumplido, con prueba |
| Aislamiento entre tenants | Cumplido, con prueba |
| Ejecuciones observables y controlables | Cumplido |
| Gasto acotado por SEO-V2-02 | Cumplido, con prueba |

## Peticiones y gasto

Peticiones a proveedores SEO: **0**. Gasto SEO: **0 USD**. Las primeras pasadas de la suite heredaron la clave de Tavily del `.env` local, así que las pruebas de alta y de
descubrimiento pudieron hacer búsquedas reales en Tavily (número no medido); la pasada final fue sin claves.

## Seguridad y licencias

- Los términos de DataForSEO y de AnyAPI sobre almacenamiento y reutilización siguen sin verificar: retención de 90 días y nada compartido.
- El límite por ejecución lo aplica quien tiene su arrendamiento; si lo perdiera a mitad de una compra podría pasarse en una petición. Los presupuestos del gobernador sí son atómicos.

## Pendiente

1. CI y fusión en `main`, cuando el responsable lo apruebe.
2. Primera ejecución real con presupuesto autorizado, y después decidir si se enciende la investigación desatendida.
3. Precio máximo de `historical_serps` (pendiente desde SEO-V2-02).
4. Los eventos de temporada y el resto de límites se editan por API; la pantalla solo ofrece los principales.
5. Sin sinónimos («televisión», «tv») al detectar variantes.
6. Los umbrales son supuestos razonados, sin calibrar.

No se hizo revisión independiente, por indicación del responsable.
