# SEO data governance

## Rules in force

- External SEO data is cached per tenant (`provider_cache_entries`, unique by tenant, provider, resource and key). Nothing is shared
  between tenants: no licence has been found that explicitly permits it.
- What leaves Auctorio: keywords, public domains, country and language. Never tenant, user or site identifiers.
- Every metric keeps its source (`keywordMetricsSource`, `KeywordMetrics.source`). Values the provider did not return are null.
- Retention: keyword data 30 days, SERP and YouTube 7 days (cache TTL). Metrics copied to plan items stay with the item.
- Credentials: encrypted at rest (AES-256-GCM), server-side only, never in responses, audits, logs or error messages.
- Audited actions: `seo.control.updated`, `seo.provider.updated`, `seo.credential.set`, `seo.credential.cleared`, `seo.provider.live_test`.

## Licensing (2026-11-24)

| | AnyAPI | DataForSEO |
|---|---|---|
| Commercial SaaS use | Permitted: Terms §11 allow reselling results and charging customers for them | Not established in this milestone |
| Storage and caching | Not addressed by the terms or the acceptable-use policy | Not established |
| Sharing between customers | Not addressed | Not established |
| Upstream licence | Undisclosed upstream; its terms are not established | First party |
| Lawful use | On the customer (§8) | Not established |
| Warranty and liability | None on accuracy or availability (§9, §12); capped (§13) | Not established |

## Before activating AnyAPI in production

1. Written confirmation from AnyAPI Labs about storing results, and about the rights of the SEO upstream.
2. Live verification of each capability in each market in use (es-ES done), and a comparison of its numbers with a known source.
3. Hard budgets (SEO-V2-02).

Until then AnyAPI stays disabled by default and its automation locked. DataForSEO's terms must be reviewed too before any data is shared
between tenants or stored in a global dataset.
