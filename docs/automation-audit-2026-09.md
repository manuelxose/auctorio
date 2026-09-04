# Automation audit — 2026-09

## Confirmed findings

- Local development is intentionally `PUBLISH_DRY_RUN=true`; it cannot prove
  a public release.
- The inspected local database has no enabled policy, autopilot policy,
  worker heartbeat, publication, or active social account.
- `assisted` previously set `autoSchedule=true`; scheduled rows are consumed
  by the scheduler, so its no-autopublish promise was not enforceable.
- Queue diagnostics could wait indefinitely when Redis/BullMQ did not answer.

## Remediation delivered

- `release-readiness.ts` is the single automatic release boundary. It checks
  policy/mode, approval, circuit state, destination credentials, social
  account health, dry-run and production consumer heartbeats.
- The scheduler returns blocked releases to `ready` with an actionable reason;
  it does not turn a configuration problem into a retry loop.
- `assisted` no longer schedules; only `autopilot` creates executable rows.
- Planner, scheduler and watchdog run under the `control` worker; the legacy
  scheduler service is retired by the deployment script.
- Redis connections and `ops:queue health` have bounded connection/operation
  waits. `ops:release-preflight` provides a read-only tenant report.

## Production activation checklist

1. Back up PostgreSQL and the deployment release directory.
2. Deploy, migrate, and run `npm run ops:release-preflight -- --tenant=<id>`
   for each tenant. Resolve every blocker; do not bypass them.
3. Verify website credentials and active connected X/Instagram accounts;
   `PUBLISH_DRY_RUN` must be `false` and production workers healthy.
4. Enable `autopilot` per verified site, observe the control, publishing and
   social workers plus publication attempts, and pause the affected policy on
   the first unexpected remote error.

## Deliberate non-removals

- Legacy launcher/service files remain as compatibility artifacts until the
  production cutover confirms the control worker is running. No source or
  dependency was removed without a reference-proof.
