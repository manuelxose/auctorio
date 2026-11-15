# STUDIO-08 — Calendar, publications and delivery recovery (2026-11-15)

Branch `feat/editorial-operating-system` (HEAD before this work: `a5a2868`). Independent review: intentionally not done, per project owner instruction. No live publication, no migration.

## Findings (classified)
| # | Problem | Class | Root cause | Fix |
|---|---|---|---|---|
| 1 | Scheduling the same content twice created a second Publication row | CONFIRMED CODE | `createPublication` idempotency key included `scheduledFor` | Manual requests reuse the open record (draft/ready/scheduled/failed/canceled) for the same project+channel+account+site and reschedule it; `queued`/`publishing` → 409 `publication_in_flight`. Automation path unchanged (planner already skips existing channels). `failed → scheduled` added to the state machine (retry already did it out of band). |
| 2 | Past `scheduledFor` accepted on create/PATCH/schedule/reschedule (fired immediately) | CONFIRMED CODE | no validation | 400 `scheduled_in_past` (60 s grace); publish-now is the explicit path |
| 3 | publish-now accepted rows whose destination was not releasable; blocker only surfaced at the next scheduler tick | CONFIRMED CODE | no readiness check in the route | publish-now evaluates `getPublicationReleaseReadiness(id, { manual: true })` first → 409 `release_blocked:<codes>`; audited as `publication.release_requested`. Publications shows the named blockers. |
| 4 | Retry after an approve failure created a second remote GuíaTV draft; a timed-out create was retried in-call | CONFIRMED CODE | draft id lost on approve error; `postJson` `retries: 1` on a non-idempotent POST | approve error carries `externalId`; worker persists it on the publication job and reuses it on retry; draft create `retries: 0` |
| 5 | Rows stuck in `queued`/`publishing` forever after a lost job/crashed worker | CONFIRMED CODE | no stall recovery | `recoverStalledPublications` (scheduler tick, after the congestion guard, `PUBLICATION_STALL_MINUTES` default 60): `failed`/`stalled`, no automatic retry (remote outcome unknown), job freed for manual retry, audit + operator notification |
| 6 | Calendar used browser timezone; proposals vs scheduled only distinguished in month chips | CONFIRMED CODE | browser `Date` math | `/v2/calendar` returns the site `timeZone`; labels, grouping, drag and Move/Schedule inputs use it (DST-safe `zonedToUtc`); UTC shown on hover; cards dashed for proposals, `aria-label` states kind/status/time; legend |
| 7 | Remote URL verification invisible | CONFIRMED CODE | `metadata.verification` not rendered | Publications shows verified/unverified and failure reason labels |
| 8 | Publishing vs Publications overlap | Already resolved | `/studio/publishing` redirects to Publications | none |

Content scheduling already goes through Calendar (`?projectId=`) → `POST /v2/publications`: one route contract.

## Tests run
- `npm run build` + `node --test`: `publishers` 26/26, `worker-publishing` 5/5, `publication-circuit-breaker` 5/5, `phase5-operations` 9/10 — the one failure (`duplicate enqueuePublication…`) is the queue-cleanup step: a running local social worker holds the job lock (environmental, not this change). New: guiatv draft-id carry + no create retry; worker reuses persisted draft id; failed→scheduled; one canonical record (+ in-flight refusal); stall recovery; manual readiness.
- Angular `ng test` 33/33 (new: Europe/Madrid DST wall clock, proposal vs scheduled aria-label). `npm run build:studio` PASS (initial bundle budget warning: 501.12 kB / 500 kB).
- `npm run typecheck` PASS.
- Playwright `e2e/specs/calendar-publications.spec.ts` PASS against local Studio (past-time 400, same record on re-schedule and reschedule, calendar returns `timeZone` and the publication once, UI legend at 1440/1024/390, cancel at end). Screenshots: `docs/studio-rebuild/evidence/studio-08/`.
- Not run: full `npm test` (runs `prisma migrate deploy`), axe audit, publish-now against a real destination (no live publish allowed).

## Dimension verdicts
IMPLEMENTATION PASS · FUNCTIONALITY PASS · UX/UI PARTIAL (calendar verified; Publications changes not screenshotted) · ACCESSIBILITY PARTIAL (aria-labels added, no axe run) · SECURITY PASS (tenant-scoped ownership check before readiness; no secrets logged) · INTEGRATION PARTIAL (only GuíaTV publisher carries the draft id on failure; other publishers single-step) · REGRESSION PARTIAL (focused suites only) · PRODUCTION READINESS BLOCKED (no deploy/live destination).

## Remaining risks
- A stalled *social* row retried manually while its original BullMQ job is still alive could post twice; the 60-min threshold and no-auto-retry reduce, not remove, this.
- A new content version after a failed approve gets a new job key, so the earlier draft id is not reused.
- Rollback: revert the commit; no schema change.
