# SEO V2 architecture

State after SEO-V2-02. Sections marked *(later)* are not built.

## Layers

| Layer | File | Responsibility |
|---|---|---|
| Consumers | `src/studio/keyword-metrics.ts`, `keyword-candidates.ts`, `serp-sources.ts`, `youtube-videos.ts` | Ask for a capability and say what decision needs it; degrade without blocking |
| Manager | `src/studio/seo-manager.ts` | The only way to a provider: reuse stored data, buy what is missing, coalesce, queue by priority, record health and circuit |
| Cost Governor | `src/studio/seo-governor.ts` | Budgets, atomic reservations, leases (single flight), settlement, recovery |
| Cache | `src/studio/seo-cache.ts` | Canonical keys in `provider_cache_entries`, field provenance, history, retention |
| Prices, policy | `src/infrastructure/seo/pricing.ts`, `policy.ts` | Versioned price registry; freshness, retention and acquisition policy. Pure |
| Registry | `src/infrastructure/seo/registry.ts` | Providers, modes, selection rules, locks. Pure |
| Contract | `src/infrastructure/seo/contract.ts` | Capabilities, requests, results, quotes, errors, licensing |
| Adapters | `src/infrastructure/seo/dataforseo.ts`, `anyapi.ts` | Everything provider-specific |
| Control plane | `src/studio/routes-admin-seo.ts`, Studio → Ajustes → Administración global → Proveedores SEO (`/studio/admin/seo`) | Platform administrators only |

The Knowledge & Opportunity Repository of the owner's diagram is *(later)*.

## A call, step by step

1. A consumer calls `seoRoute(capability, locale)`. It reads the control state from the database and returns the provider, market and
   cache-key prefix, or the reason nobody may serve it. It never calls a provider.
2. `acquireSeo` reads the stored data under its canonical keys. Keyword batches asked within 25 ms travel together.
3. What is missing is bought; what is stale only if the pending decision is worth more than refreshing it.
4. In a priority slot, the control state is read again and `reserveSeoSpend` runs under one database lock: control state, licence,
   circuit, rate, leases of each cache key, price, and every budget. Any refusal leaves nothing behind.
5. Keys another worker is buying are waited for, not bought.
6. `dispatchSeoReservation` is the last check: emergency stop, kill switch, provider switch and reservation still alive, in one statement.
7. The adapter sends one request. The answer is stored, then the reservation is settled together with its `ai_spend_events` row.

## Selection

| Mode | Who serves |
|---|---|
| `disabled` | Nobody. Stops every external SEO call, authorized tests included |
| `dataforseo_only` (default) | DataForSEO: what production did before SEO V2 |
| `anyapi_only` | AnyAPI |
| `manual` | The provider chosen for each capability; a capability left out is not acquired |
| `cost_optimized` | Lowest known maximum price, then priority. Implemented and **locked** |

A provider serves a capability only if it is enabled, declares it, has credentials and can serve the market. An unreadable
mode counts as `disabled`.

`SEO_LOCKS` (code, not a setting) keeps closed until the production activation gates are met: automatic routing, paid fallback and
AnyAPI automation. While closed, AnyAPI can only be reached by an administrator's authorized live test.

## Control state

- `seo_control_settings` (one row, `global`): mode and per-capability routing.
- `seo_provider_states`: enabled, priority, last success and error, live verifications.
- No rows means the code defaults (`DEFAULT_CONTROL`).
- Credentials are in `ai_provider_keys` (AES-256-GCM), the project's existing mechanism; a saved value wins over the server env.

## Decisions

- **Cache stays per tenant and per provider.** Metrics of two providers are never merged or used as each other's cache.
- **Cache keys are canonical since SEO-V2-02**; entries under the older keys (`2724|es|keyword`) are read until they expire.
- **Page excerpts moved to the `web` cache key.** They are read by our crawler, not bought. The old entries (7-day TTL) are
  simply read again at no cost.
- **`KeywordMetrics` new fields are optional**, so payloads cached earlier remain valid; absent means unknown.
- **A partial answer is not negative-cached**: a keyword missing from it stays "never checked".
- **No external calls in tests**: the adapters refuse the real `fetch` inside the test runner.

## Adding a provider

Implement `SeoProvider`, append it to `SEO_PROVIDERS`, add its defaults to `DEFAULT_CONTROL` (disabled) and its id to
`SEO_LOCKS.paidAutomation`, run it through `tests/seo-providers.test.ts`, and document it in
[provider-capabilities.md](provider-capabilities.md).

## Cost Governor

| State | Holds in budgets | How it ends |
|---|---|---|
| `reserved` | maximum | dispatched; or released when the worker is lost (2 min) or the request is stopped |
| `dispatched` | maximum | settled, released (not billed) or uncertain |
| `uncertain` | maximum, with no time limit | settled by a late answer, or resolved by an administrator |
| `settled` | actual cost | final |
| `released` | nothing | final |

- **Reservations have no foreign keys**: deleting a tenant does not give its spending back to the platform budgets.
- **Budgets are a separate table from `cost_budgets`** because the rules differ (all apply, instead of the most specific). The ledger is shared:
  each settled request has one `ai_spend_events` row (`reservation_id`, unique), and the tenant's `cost_budgets` also limit SEO.
- **Leases are per cache key**, so overlapping keyword batches of different workers never buy the same keyword. A failed key cools down
  for 1, 4, 16… minutes (at most a day); a possibly billed one is not asked again for 24 h.
- **Stored metrics are per field.** Suggestions and rankings of a provider feed the same keyword entries as its overview. Different
  providers are never merged.
- **Ordinary editing never buys** (changing the keyword of a plan item): it uses what is stored; the next planning run measures the rest together.
- **No consumer asks two providers for the same data**, and a failed purchase never goes on to another provider.
