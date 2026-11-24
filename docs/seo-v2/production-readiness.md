# SEO V2 production readiness

| Gate | State after SEO-V2-01 |
|---|---|
| Provider contract, registry and adapters | Done |
| Kill switch and per-provider switch, effective on the next call in every process | Done |
| Encrypted credentials, permissions, audit | Done |
| DataForSEO live verification through the new path | Pending (paid) |
| AnyAPI live verification | Pending (paid; needs a key and an authorized budget) |
| AnyAPI storage and upstream licensing | Pending (written confirmation) |
| Hard global, tenant and site budgets | SEO-V2-02 |
| Lifting `SEO_LOCKS` | SEO-V2-02, after the three gates above |

## Deploying

1. `npx prisma migrate deploy` adds `seo_provider_states` and `seo_control_settings` (additive; nothing existing changes).
2. With no rows, behaviour is the previous one: DataForSEO only, with the credentials already in the server env.
3. `SOCIAL_TOKEN_ENCRYPTION_KEY` must be set to save credentials from the panel.
4. Rollback: the previous release ignores the two tables; they can stay.

## Operating

- Stop everything: Studio → Settings → SEO providers → **Disable all external SEO calls** (or `PUT /v2/admin/seo/control` with `{"mode":"disabled"}`).
  Requests already sent are not recalled.
- Health: last success and last error per provider on the same page.
- Log events: `seo.cost_unreported`, `seo.cost_unknown_after_error`, `seo.billed_over_quote`, `seo.spend_not_recorded`, `seo.notes`, `seo.health_not_recorded`,
  `keyword_metrics.skipped`.
- Live test: enable the provider, then **Authorize and test** with a ceiling. Automation stays locked while doing it.

## Merging with `feat/studio-settings-advanced-integration`

That branch (16 commits, not in main when SEO-V2-01 started) edits `keyword-candidates.ts`, `editorial-plan.ts` and
`routes-editorial.ts`, and adds callers that use the former `fetchers` parameter and the literal `provider: "dataforseo"`.
When it is merged: replace `fetchers` by `fetchImpl`, take `provider` and `market` from the route, and map the route's `reason` to `skipped`.
