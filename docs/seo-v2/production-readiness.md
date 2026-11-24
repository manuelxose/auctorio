# SEO V2 production readiness

| Gate | State after SEO-V2-01 |
|---|---|
| Provider contract, registry and adapters | Done |
| Kill switch and per-provider switch, effective on the next call in every process | Done |
| Encrypted credentials, permissions, audit | Done |
| DataForSEO live verification through the new path | Pending (paid) |
| AnyAPI live verification | Done for es-ES, one call per operation; accuracy not compared. Each environment records its own |
| AnyAPI storage and upstream licensing | Pending (written confirmation) |
| Hard global, tenant and site budgets | SEO-V2-02 |
| Lifting `SEO_LOCKS` | SEO-V2-02, after the three gates above |

## Deploying

1. `npx prisma migrate deploy` adds `seo_provider_states` and `seo_control_settings` (additive; nothing existing changes).
2. With no rows, behaviour is the previous one: DataForSEO only, with the credentials already in the server env.
3. `SOCIAL_TOKEN_ENCRYPTION_KEY` must be set to save credentials from the panel.
4. Rollback: the previous release ignores the two tables; they can stay.

## Operating

- Stop everything: Studio → Ajustes → Administración global → Proveedores SEO → **Desactivar todo el SEO externo** (or `PUT /v2/admin/seo/control` with `{"mode":"disabled"}`).
  Requests already sent are not recalled.
- Health: last success and last error per provider on the same page.
- Log events: `seo.cost_unreported`, `seo.cost_unknown_after_error`, `seo.billed_over_quote`, `seo.spend_not_recorded`, `seo.notes`, `seo.health_not_recorded`,
  `keyword_metrics.skipped`.
- Live test: enable the provider, then **Autorizar y probar** with a ceiling. Automation stays locked while doing it.

## Unified with the Studio redesign

`feat/studio-settings-advanced-integration` (settings, advanced, social and Autopilot month plan) is merged into the SEO-V2-01
branch. Its month plan, keyword research and automation read the SEO manager instead of DataForSEO; research records the
provider that measured (`provider`, `selection.source`) or why there was none (`not_configured`, `disabled`, `unsupported_market`,
`provider_error`, `no_data`). Plans stored earlier keep `"dataforseo"` and are still read.

The unified branch also carries that branch's own migrations, which are dated before `20261124120000_seo_provider_control`.
