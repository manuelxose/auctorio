# Recuperación y verificación de los tres modos
Código vigente HEAD: src/studio/automation-mode.ts + automation.ts + release-readiness.ts; prisma/schema.prisma model AutomationPolicy; frontend overview-page.component.ts, automation-page.component.ts, overview-model.ts. Pruebas: tests/autopilot-mode.test.ts, tests/autopilot-planner.test.ts, e2e/specs/autopilot-golden-path.spec.ts.
Historia relevante: commit 328df21308 (aug 2026 frontend editorial/autopilot), commit f6de7fe46 (rebuild shell), ADR accepted 2026-11-12.

| Modo existente | MODE_FLAGS en backend | Contrato de producto |
|---|---|---|
| manual | enabled=false, autoGenerate=false, autoRepair=false, autoApprove=false, autoSchedule=false, autoPublish=false | Usuario solicita trabajo y controla publicación |
| assisted | enabled=true, autoGenerate=true, autoRepair=true, autoApprove=false, autoSchedule=false, autoPublish=false | IA genera y repara; aprobación/publicación humana |
| autopilot | enabled=true, autoGenerate=true, autoRepair=true, autoApprove=true, autoSchedule=true, autoPublish=true | Producir/aprobar/programar/publicar sólo si QA, credenciales y readiness lo permiten |

normalizeAutomationMode preserva los flags legacy; buildModePayload produce flags atómicos. automation.ts resolveModeUpdate prevalece modo enviado. En frontend automation-page.component.ts:384+, setMode('assisted') asigna autoSchedule=true en memoria mientras el mapa backend exige false. Corregir fuente única y probar estado antes/después de save.

Overview ya ofrece selector inline en onboarding (líneas 177-188; 341-345; 522+); Automation también. La afirmación "desaparecidos" no es ausencia del código actual, sino un fallo de discoverability/visibilidad/runtime aún no verificado. En el nuevo sistema ofrecer simple selector en Overview y configuración completa bajo Automation/Settings, con confirmación al habilitar Autopilot y bloqueo de activación si no existe readiness. Manual no debe figurar como "setup incomplete" únicamente por enabled=false; verificar setupSteps y testimonios UI. Nunca cambiar flags directamente en el cliente como contrato autoritativo.
