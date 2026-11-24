# SEO cost model

Published list prices in USD, read on 2026-11-24. Prices change; re-check before relying on them.

| Capability | DataForSEO (live) | AnyAPI | Cheaper |
|---|---|---|---|
| `keyword_metrics` | 0.012 + 0.00012 per keyword | 0.01438 + 0.00016 per keyword | DataForSEO (1 kw: 0.01212 vs 0.01454; 700: 0.096 vs 0.12638) |
| `keyword_suggestions` | 0.012 + 0.00012 per row | 0.01496 + 0.00016 per row | DataForSEO (100 rows: 0.024 vs 0.03096) |
| `ranked_keywords` | 0.012 + 0.00012 per row | 0.01496 + 0.00016 per row | DataForSEO (100 rows: 0.024 vs 0.03096) |
| `search_volume` | 0.09 per task (≤1000) | 0.108 per request (≤1000) | DataForSEO |
| `serp_organic` | 0.00012 per stored SERP; how many is unknown beforehand | 0.0005, at most 0.002 with failover | Not comparable: historical vs live |
| `youtube_search` | 0.002 per 20 results | 0.00034, at most 0.0012 with failover | AnyAPI |

**AnyAPI does not lower the cost of the four keyword operations: at list price it is 20–32 % dearer.** It is cheaper only for
YouTube and gives live Google results for 0.0005–0.002. Any saving in SEO V2 has to come from caching, batching and
deduplication, or from using each provider where it is cheaper.

| | DataForSEO | AnyAPI |
|---|---|---|
| Unit | Task plus item | Request, or base plus result |
| Minimum top-up | 50 USD | Not established ("may apply") |
| Expiry | Balance never expires | Purchased funds do not expire; promotional credit may |
| Free trial | 1 USD for new accounts | About 100 requests at sign-up |
| Refunds | Not established | Unused purchased funds, 14 days |

Sources: dataforseo.com/pricing (`dataforseo-labs/dataforseo-google-api`, `keywords-data/google-ads`, `serp/youtube-serp-api`);
api.getanyapi.com/catalog; getanyapi.com/terms.

AnyAPI prices were confirmed by its own quote endpoint on 2026-11-24 for all six operations. One live test of each, together, costs at most
0.15598 USD.

## Accounting rules

- `quote()` gives an estimate and a maximum. `null` means unknown: such a provider cannot win automatic routing and cannot be
  live-tested. DataForSEO's `serp_organic` is the only such case; its existing use (one cached call per guide) is preserved.
- What the provider reports as billed is recorded in `ai_spend_events` (provider, resource, tenant, site), on failures too.
- An unreported cost is recorded at the quote's maximum, never zero, and logged (`seo.cost_unreported`).
- A failure whose cost is unknown (a timeout) is logged (`seo.cost_unknown_after_error`), not recorded. SEO-V2-02 must reserve
  the maximum before the call and settle it afterwards.
- Billing above the quote is logged as an error (`seo.billed_over_quote`).
- Live test: explicit authorization, known maximum price within the administrator's ceiling, and never above 0.25 USD.

## Not enforced yet (SEO-V2-02)

Hard global, tenant and site budgets; reservation before spending; cross-request deduplication; lifting `SEO_LOCKS`.
Today DataForSEO spending is bounded only by each consumer's own caps and cache: at most 9 candidate calls per plan (30 days)
and one SERP plus one video per guide (7 days). At list price a full, uncached plan is 9 × 0.024 = 0.216 USD, plus metrics.
