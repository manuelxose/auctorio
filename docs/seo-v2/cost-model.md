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

AnyAPI prices were confirmed by its own quote endpoint on 2026-11-24 for all six operations. The live
test billed 0.15378 USD, equal in the wallet (0.16 → 0.00622) and in `ai_spend_events`. YouTube was billed 0.0005, not its 0.00034
list price: another lane served it, within the quoted maximum.

## Budgets in force without configuration (USD)

| Budget | Limit |
|---|---|
| Platform | 25 a month, 5 a day |
| Each provider | 20 a month |
| Each plan, per workspace | 5 a month |
| Each workspace | 5 a month, 2 a day |
| Each site | 3 a month (recurring), 2 in all while onboarding (14 days), 1 a day, 0.5 a month for `search_volume` |

They are initial assumptions, editable in the panel. All apply at once. Budgets start counting when SEO-V2-02 is deployed: earlier spending
has no reservations. Months and days are UTC. Background work may use 80 % of a recurring limit.

## Accounting rules

- Prices live in `pricing.ts` (`SEO_PRICING_VERSION`); each reservation records its version. `null` means unknown: **nothing is
  bought**. DataForSEO's `serp_organic` is the only such case, so guides get no SERP sources until an administrator records a ceiling.
- A recorded ceiling never lowers a list price. Billing above the maximum settles the real amount, is logged (`seo.billed_over_quote`)
  and closes the operation until an administrator confirms a new maximum.
- An unreported cost is settled at the maximum, never zero (`seo.cost_unreported`).
- A failure with an unknown bill (a timeout) becomes `uncertain` and keeps holding its maximum.
- DataForSEO failures use the cost in their envelope; without one, only refused credentials or balance count as free.
- Live test: explicit authorization, known maximum price within the administrator's ceiling, and never above 0.25 USD.

## Where the saving comes from

- A full, uncached plan costs at most 9 × 0.024 = 0.216 USD. Calls stop once there are as many candidates as the plan can use.
- Volume, CPC, difficulty and intent that came with discovery are not bought again; a missing difficulty does not trigger an overview.
- `search_volume` costs 0.09 USD flat: it waits until at least 10 keywords need it.
- Freshness: keyword data 75 days (60–90), rankings 60 (30–90), SERP and YouTube 21 (14–30), time-sensitive SERP 3. Nothing is refreshed on a schedule.
