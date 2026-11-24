# SEO V2 architecture

State after SEO-V2-01. Sections marked *(later)* are not built.

## Layers

| Layer | File | Responsibility |
|---|---|---|
| Consumers | `src/studio/keyword-metrics.ts`, `keyword-candidates.ts`, `serp-sources.ts`, `youtube-videos.ts` | Ask for a capability, cache per tenant and provider, degrade without blocking |
| Manager | `src/studio/seo-manager.ts` | The only way to a provider: route, re-check control state, batch, call, record spend and health |
| Registry | `src/infrastructure/seo/registry.ts` | Providers, modes, selection rules, locks. Pure |
| Contract | `src/infrastructure/seo/contract.ts` | Capabilities, requests, results, quotes, errors, licensing |
| Adapters | `src/infrastructure/seo/dataforseo.ts`, `anyapi.ts` | Everything provider-specific |
| Control plane | `src/studio/routes-admin-seo.ts`, Studio → Settings → SEO providers (`/studio/admin/seo`) | Platform administrators only |

The Cost Governor and the Knowledge & Opportunity Repository of the owner's diagram are *(later)*: SEO-V2-02 and on.

## A call, step by step

1. A consumer calls `seoRoute(capability, locale)`. It reads the control state from the database and returns the provider, market and
   cache-key prefix, or the reason nobody may serve it. It never calls a provider.
2. The consumer looks in `provider_cache_entries` under `(tenant, provider, resource, market|subject)`.
3. On a miss, `acquireSeo` validates the request against the capability declaration, reads the control state **again** and
   selects again. A provider disabled in between is not called.
4. The adapter sends one request. Batches above the provider's limit are split by the manager.
5. The manager records the billed cost in `ai_spend_events` (also for failed calls that were billed), and the provider's
   health in `seo_provider_states`.

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

`SEO_LOCKS` (code, not a setting) keeps closed until SEO-V2-02 enforces hard budgets: automatic routing, paid fallback and
AnyAPI automation. While closed, AnyAPI can only be reached by an administrator's authorized live test.

## Control state

- `seo_control_settings` (one row, `global`): mode and per-capability routing.
- `seo_provider_states`: enabled, priority, last success and error, live verifications.
- No rows means the code defaults (`DEFAULT_CONTROL`).
- Credentials are in `ai_provider_keys` (AES-256-GCM), the project's existing mechanism; a saved value wins over the server env.

## Decisions

- **Cache stays per tenant and per provider.** Metrics of two providers are never merged or used as each other's cache.
- **DataForSEO cache keys did not change** (`2724|es|keyword`), so entries cached before SEO V2 are still read.
- **Page excerpts moved to the `web` cache key.** They are read by our crawler, not bought. The old entries (7-day TTL) are
  simply read again at no cost.
- **`KeywordMetrics` new fields are optional**, so payloads cached earlier remain valid; absent means unknown.
- **A partial answer is not negative-cached**: a keyword missing from it stays "never checked".
- **No external calls in tests**: the adapters refuse the real `fetch` inside the test runner.

## Adding a provider

Implement `SeoProvider`, append it to `SEO_PROVIDERS`, add its defaults to `DEFAULT_CONTROL` (disabled) and its id to
`SEO_LOCKS.paidAutomation`, run it through `tests/seo-providers.test.ts`, and document it in
[provider-capabilities.md](provider-capabilities.md).
