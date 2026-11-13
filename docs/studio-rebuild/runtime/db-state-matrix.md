# Sanitized state matrix — STUDIO-01 (clean-DB rerun, 2026-11-13)

Local DB was reset from zero (`prisma migrate reset`, 34 migrations, Redis flushed), then bootstrapped like an operator would: tenant `Auctorio`, one owner/admin QA user, two sites via `scripts/provision-linked-tenants.ts`. API + 9 workers + Studio running. AI provider is the `.env` mock (no real keys).

| Site | key | Mode | enabled | autoPublish |
|---|---|---|---|---|
| GuiaProgramacionTV | guiatv-editorial | manual | true | false |
| Tecnoria (fictitious `tecnoria.example.test`) | tecnoria-main | manual | false | false |
| E2E Webhook Target (created by the e2e run itself) | httpbin-org-b5b8dc | manual | false | false |

- publishing-accounts 0, social-connections 0, connector-installations 2 (created by e2e). No secrets read.
- Finding (CONFIRMED CODE + runtime): a brand-new tenant with **zero sites cannot log in with a password** — `completeGlobalAccountLogin` throws `user_not_authorized` when `sites.length === 0` (src/studio/auth.ts ~1866). The first site must be provisioned by an operator script; there is no self-serve first-site path.
- The earlier dirty-DB snapshot (17 orphan connector installations, GuiaTV `assisted`) is obsolete; do not use it.
