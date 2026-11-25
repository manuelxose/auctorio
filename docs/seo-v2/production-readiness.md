# SEO V2 production readiness

| Gate | State after SEO-V2-03 |
|---|---|
| Provider contract, registry and adapters | Done |
| Kill switch and per-provider switch, effective on the next call in every process | Done |
| Encrypted credentials, permissions, audit | Done |
| DataForSEO live verification through the new path | Pending (paid) |
| AnyAPI live verification | Done for es-ES, one call per operation; accuracy not compared. Each environment records its own |
| AnyAPI storage and upstream licensing | Pending (written confirmation) |
| Hard budgets, reservations, single flight, emergency stop | Done |
| Maximum price of DataForSEO `serp_organic` | Pending: an administrator must record it (invoice or tariff) |
| Search Console live authorization | Synchronization checked live on 2026-11-24. Authorization, refresh and revocation pending: `GOOGLE_CLIENT_SECRET`, the API and the consent screen of the Google project |
| Google verification of the OAuth app | Pending: `webmasters.readonly` is a sensitive scope; until verified, only test users can connect |
| Research engine with a paid provider | Pending: never run against a real provider (no budget authorized) |
| Lifting `SEO_LOCKS` | Pending: licensing, DataForSEO live verification and owner approval |

## Deploying

- SEO-V2-03 (`20261125120000_seo_persistent_knowledge`) is additive: six tables and new nullable columns. Deploy API and workers together: an older API would still buy while
  planning. Workers start research by themselves only once an administrator allows it (Proveedores SEO → **Dejar que la investigación SEO empiece sola**, policy
  `automaticResearch`, off by default); then, at most 0.25 USD per run within the governor's budgets. Onboarding, a plan with too little knowledge and manual runs do not need it.
- SEO-V2-04 (`20261124220000_first_party_seo`) is additive: five tables and new nullable or defaulted columns in `content_opportunities`. Set
  `GOOGLE_CLIENT_SECRET` for the API and the automation worker; without it Search Console is not offered and everything else works.
0. SEO-V2-02 (`20261124180000_seo_cost_governor`) is additive: five tables and new nullable or defaulted columns. Deploy API and workers together: an
   older worker spends without reserving. Review the default budgets and record the `serp_organic` ceiling if guides need SERP sources.
1. `npx prisma migrate deploy` adds `seo_provider_states` and `seo_control_settings` (additive; nothing existing changes).
2. With no rows, behaviour is the previous one: DataForSEO only, with the credentials already in the server env.
3. `SOCIAL_TOKEN_ENCRYPTION_KEY` must be set to save credentials from the panel.
4. Rollback: the previous release ignores the two tables; they can stay.

## Operating

- Stop everything: Studio → Ajustes → Administración global → Proveedores SEO → **Desactivar todo el SEO externo** (or `PUT /v2/admin/seo/control` with `{"mode":"disabled"}`).
  Requests already sent are not recalled.
- Emergency stop: same page, **Parar todo ahora** (or `PUT /v2/admin/seo/emergency-stop` with `{"active":true}`); it keeps the mode.
- Requests without a known bill appear in **Peticiones sin confirmar** and hold budget until resolved with the provider's statement.
- Circuit breaker: 30 min after refused credentials or balance, 1 min after a rate limit, 5–60 min after three failures in a row. Saving credentials or **Reintentar ya** resets it.
- Health: last success and last error per provider on the same page.
- Research: Studio → Avanzado → Investigación SEO, per site: pause, resume, cancel, retry, limits and mode. The emergency stop halts every run.
- Log events: `seo_research.finished`, `seo_research.task_retry`, `seo_research.task_failed`, `seo_research.advance_failed`, `seo_research.check_failed`, `seo.cost_unreported`, `seo.cost_unknown_after_error`, `seo.billed_over_quote`, `seo.spend_not_recorded`, `seo.notes`, `seo.health_not_recorded`,
  `search_console.synced`, `search_console.sync_failed`, `seo_intelligence.analyzed`, `seo_intelligence.analysis_failed`, `seo.budget_exhausted`, `seo.circuit_open`, `seo.reservation_uncertain`, `seo.cache_not_written`, `keyword_metrics.skipped`.
- Live test: enable the provider, then **Autorizar y probar** with a ceiling. Automation stays locked while doing it.

## Unified with the Studio redesign

`feat/studio-settings-advanced-integration` (settings, advanced, social and Autopilot month plan) is merged into the SEO-V2-01
branch. Its month plan, keyword research and automation read the SEO manager instead of DataForSEO; research records the
provider that measured (`provider`, `selection.source`) or why there was none (`not_configured`, `disabled`, `unsupported_market`,
`provider_error`, `no_data`). Plans stored earlier keep `"dataforseo"` and are still read.

The unified branch also carries that branch's own migrations, which are dated before `20261124120000_seo_provider_control`.
