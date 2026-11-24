# SEO provider capabilities

Checked on 2026-11-24 against official sources. "Not established" means it was looked for and not found, or not verified.

## Operations

| Capability | Consumer | DataForSEO | AnyAPI |
|---|---|---|---|
| `keyword_metrics` | `keyword-metrics.ts` | Labs `keyword_overview/live`, 700 keywords | `seo.keyword_overview`, 700 keywords of ≤80 characters |
| `keyword_suggestions` | `keyword-candidates.ts` | Labs `keyword_ideas/live` | `seo.keyword_ideas` (same semantics; `seo.keyword_suggestions` only extends the phrase) |
| `ranked_keywords` | `keyword-candidates.ts` | Labs `ranked_keywords/live` | `seo.ranked_keywords`, offset pagination |
| `serp_organic` | `serp-sources.ts` | Labs `historical_serps/live`: **historical** snapshot | `google.search`: **live**, about 10 results per page |
| `search_volume` | `keyword-metrics.ts` | Google Ads `search_volume/live`, 1000 keywords | `seo.search_volume`, 1000 keywords |
| `youtube_search` | `youtube-videos.ts` | `serp/youtube/organic/live/advanced` | `youtube.search`, no market parameter |

The two `serp_organic` sources are not equivalent: one is a stored snapshot (its date is returned in `asOf`), the other a live search.
Difficulty scales belong to each provider and are not comparable.

## Data kinds

| Field | Kind |
|---|---|
| volume, cpc, paid competition | provider_reported |
| difficulty, intent, estimated traffic | estimated (by the provider) |
| rank of `ranked_keywords`, DataForSEO SERP | historical |
| AnyAPI SERP, YouTube results | observed |
| null after a complete answer | unavailable |
| null, never asked or partial answer | unknown |

Organic difficulty (`difficulty`) and paid competition (`adsCompetition`) are separate fields.

## Markets

Both adapters serve ES, US, GB, MX, AR, FR, DE, IT and PT through Google's location codes. Sub-national targets are refused.
AnyAPI documents US/`en` as its default; its OpenAPI file lists no supported codes, so every AnyAPI market is **unverified**
and its results carry the note `market_unverified:<market>` until a live test confirms it.

## AnyAPI identity

- Product: **getanyapi.com**, AnyAPI Labs, Inc. (Delaware). Base `https://api.getanyapi.com`, `POST /v1/run/{sku}`.
- Discarded namesakes: anyapi.io (utility APIs), anyapi.ai (LLM gateway), any-api.com (APILayer), anyapi.com (demo page).
- Sources: `openapi.json` and `/catalog` on api.getanyapi.com; `/docs`, `/docs/rate-limits.md`, `/terms` and `/acceptable-use` on getanyapi.com.
- Authentication: `Authorization: Bearer <key>`. Redirects are refused, so the key cannot follow one.
- All six operations are synchronous. Rate limit: 500 new requests per minute, per account and API.
- The four SEO operations have one lane ("Owl") and no failover; measured 30-day uptime 97.7 % (overview), 98.4 % (ideas),
  98.3 % (ranked), 87.8 % (search volume). `google.search` has 5 lanes and `youtube.search` 6.
- Upstream provider: anonymous by design. Its identity is not established.
- Documentation discrepancy: the docs say quotes need no key; `POST /v1/apis/{sku}/quote` answered 401 without one.

### Error and billing semantics

| Status | Contract code | Billed |
|---|---|---|
| 400 `invalid_input`, 404, 409, 422 | `bad_request` | `invalid_input`: documented free; others not established |
| 401, 403 | `invalid_credentials` | No |
| 402 | `insufficient_balance` | No (spend limits) |
| 429 `rate_limited` | `rate_limited` (retryable) | No |
| 429 `provider_rate_limited` | `rate_limited` (retryable) | Not established |
| 5xx | `upstream_error` (retryable) | May be, "at cost"; the response states the amount |
| Timeout | `timeout` (retryable) | Unknown |
| 200 without the documented shape | `malformed_response` | Yes; the amount is kept |

`found: false` is a successful, possibly billed, call without data. `max_cost_usd` is sent with every call: AnyAPI refuses, uncharged, a dearer one.

## DataForSEO

Preserved unchanged on the wire: same endpoints, bodies, credentials and parsing. Errors keep their original message
(`dataforseo_http_402: …`) and gain a typed code. No live call was made in SEO-V2-01.

## Degraded modes

| Situation | Behaviour |
|---|---|
| No provider for a capability | The consumer keeps its previous no-credentials behaviour: null metrics, model-picked keywords, no extra sources, no video |
| Only one of suggestions/rankings available | Candidates come from that one |
| `search_volume` unavailable | Keywords without metrics stay null |
| AnyAPI SERP | Fewer results; links Google hides behind redirects are dropped |
| AnyAPI YouTube | No market targeting |
