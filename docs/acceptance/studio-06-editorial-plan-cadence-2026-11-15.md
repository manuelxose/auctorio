# STUDIO-06 acceptance record (2026-11-15)

Branch `feat/editorial-operating-system`. Local DB, QA account `qa.visual@auctorio.localhost` (provisioned with `scripts/qa-visual-login.ts`).

## Findings vs. current code
| Problem | Class | Status |
|---|---|---|
| Approved pillar discarded as unknown cluster | CONFIRMED CODE (audit) | Already fixed: `pillarAliases` in `site-relevance.ts` / `editorial-plan-context.ts`; test `site-intelligence.test.ts` |
| Slot coverage vs status, retry exhaustion | CONFIRMED CODE | Bounded `topUpPlanItems`, per-slot `unfilledSlots`, `fill`; **new**: unfilled reason lists top rejection categories + fix (`assignBriefsToSlots`) |
| Edited title/outline not reaching production | CONFIRMED CODE | Already propagated in `production/plan-item.ts` (`finalSuggestedTitle`, outline H2s); `plan-item-brief-title.test.ts` |
| Proposal date vs publication schedule | CONFIRMED CODE | **new**: backlog column renamed "Proposed date"; page copy states Calendar is authoritative |

## Verification run
- `npm run typecheck`: pass. `npm run build:studio`: pass.
- `node --test` (editorial-plan-v2, plan-slots, planning-workspace, plan-item-brief-title, site-intelligence): 58/58 pass (includes new PLAN-05).
- Playwright `e2e/specs/plan-cadence.spec.ts` (new): pass. Loads `/studio/editorial-plan` at 1440/1024/390 with no page errors; opening the generator (`?new=1`) leaves `/v2/editorial-plans` unchanged (a proposal view creates no plan or publication).
- Screenshots: `docs/studio-rebuild/evidence/studio-06/`. Local plan shows 7/7 proposals for a 7x1 cadence on Europe/Madrid.

## Not run
- `npm test` (runs `prisma migrate deploy`), 7x2/7x3 live generation with an AI provider (covered by deterministic fixtures PLAN-04/04b only), DST test beyond existing `plan-slots` cases, independent review (skipped by user preference).

## Verdicts
IMPLEMENTATION PASS · FUNCTIONALITY PASS (fixtures; live 7x2/7x3 not rerun) · UX/UI PASS (3 widths) · ACCESSIBILITY PARTIAL (no axe/keyboard audit) · SECURITY PASS (no auth/tenant code changed) · INTEGRATION PASS (plan page and API) · REGRESSION PASS (58 unit + e2e) · PRODUCTION READINESS BLOCKED (no deploy/live credentials checked).
