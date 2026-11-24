# Codex en Auctorio

El checkout activo carga `.codex/config.toml` y descubre los perfiles en `.codex/agents/`. Para un checkout confiable nuevo, copia `.codex/config.harness.toml` como `.codex/config.toml`. Si ya existe, integra las claves raíz antes de las tablas y fusiona `[agents]`. El archivo activo se ignora porque puede contener transportes y rutas locales.

Usa el proveedor nativo OpenAI de Codex. La CLI 0.164.0 ignora `model_provider` en configuración de proyecto. Comprueba que el perfil de usuario conserva OpenAI. La política exige los modelos declarados y detiene el trabajo si falla la selección exacta.

Graphify usa el índice local ignorado `graphify-out/graph.json`. Consulta primero con `graphify query "<símbolo>" --budget 450` y verifica el resultado en el código. Comprueba la vigencia del índice antes de usarlo. El workflow emplea el skill Graphify instalado y Ponytail full. `AGENTS.md` activa el skill Caveman de este repositorio desde la sesión inicial. Esta instalación usa solo el texto del skill y emplea las herramientas nativas para el resto del flujo.

Valida el arranque con `codex app-server --strict-config --print-startup-config`. Usa una sesión nueva y un encargo de solo lectura para comprobar el enrutamiento real. Revisa el inicio de la sesión y los eventos de agentes. Las declaraciones TOML y el catálogo en caché sirven para validar estructura y disponibilidad anunciada.

Usa `codex exec --json` para obtener la telemetría disponible en `turn.completed.usage`. Conserva el log fuera de Git. Registra tiempos, resultados y reintentos junto a la evidencia. Este entorno se autentica con ChatGPT. Las métricas de suscripción se reportan sin convertirlas en cargos API.

## Evidencia del bootstrap

- Graphify 0.9.94 consultó el índice de Auctorio y devolvió rutas del frontend y sus pruebas. El arranque estricto de Codex 0.164.0 pasó tras completar el transporte local de Context Mode.
- Una sesión nueva solicitó Sol medium. El backend devolvió `model_not_found` con el mensaje `The 'gpt-6.2-sol' model is not supported when using Codex with a ChatGPT account.` La sesión terminó antes de una respuesta o de delegar. La prueba produjo un log local `auctorio-codex-e2e.log` y careció de un evento de uso.
- `npm run build` y `npm run build:studio` pasaron. Angular emitió advertencias de presupuesto CSS. Las 32 pruebas focalizadas de prompts, QA y publicación pasaron.
- La regresión de Node registró 309 casos aprobados y quedó detenida sin resumen final. El proceso se cerró y el log completo quedó en `auctorio-harness-regression.log` en el directorio temporal.

Caveman procede del [skill oficial](https://github.com/JuliusBrussee/caveman/tree/a192894723a8f47e7f504c7b5041967ff1f18e55/skills/caveman).
