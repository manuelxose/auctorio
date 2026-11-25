# SEO data governance

## Rules in force

- External SEO data is cached per tenant (`provider_cache_entries`, unique by tenant, provider, resource and key). Nothing is shared
  between tenants: no licence has been found that explicitly permits it.
- What leaves Auctorio: keywords, public domains, country and language. Never tenant, user or site identifiers.
- Every metric keeps its source (`keywordMetricsSource`, `KeywordMetrics.source`). Values the provider did not return are null.
- Each value keeps its provenance: operation, date, kind, upstream. A value is replaced by a newer one, never by "not returned".
- Retention follows the licence: nothing where storing is prohibited, 90 days where it is not established (both providers today), 730 where
  permitted. Expired cache and history (`seo_snapshots`) are deleted after a purchase, at most hourly. Metrics copied to plan items stay with the item.
- A provider whose licence prohibits commercial use is never called.
- Search Console data is private to the tenant: every table has tenant and site, every query filters by both, and it is never cached or shared between tenants.
  A site may only read the property of its own domain. Choosing another property deletes the previous figures.
- A revoked token is deleted at once. Disconnecting deletes the token and, if asked, every stored figure and what was derived from it. The grant is revoked
  in Google only when no other site of the same person uses it.
- Impressions are the site's own visibility, never market volume; average position is never shown as a live rank.
- Two classes of data. (A) Market intelligence: what providers say of a keyword in a market (`seo_keyword_metrics`), with no site in it. (B) Private: Search Console, opportunities,
  site keywords, discoveries, profiles, plans, runs. Every (B) query filters by tenant and site.
- Sharing (A) between workspaces is off. It needs the platform policy `shareMarketData` **and** a provider whose licence permits storing and sharing (`sharableProviders`), checked when
  the row was collected and again when it is read. No provider qualifies today. Even then only exact keywords are answered: nobody can list another's keywords or learn who collected them.
- Retention of knowledge follows the licence (`retain_until`) and is purged with the cache; a site keyword without any discovery left and no opportunity goes too.
- Disconnecting Search Console with deletion also clears the derived research profile and the reason of runs that quoted its figures.
- Credentials: encrypted at rest (AES-256-GCM), server-side only, never in responses, audits, logs or error messages.
- Audited actions: `seo.control.updated`, `seo.provider.updated`, `seo.credential.set`, `seo.credential.cleared`, `seo.provider.live_test`,
  `seo.budget.updated`, `seo.budget.authorized`, `seo.budget.authorization_revoked`, `seo.reservation.resolved`, `seo.pricing.updated`, `seo.policy.updated`,
  `seo.emergency_stop.activated`, `seo.emergency_stop.lifted`,
  `search_console.connection_started`, `search_console.connected`, `search_console.property_selected`, `search_console.disconnected`,
  `seo_research.requested`, `seo_research.pause`, `seo_research.resume`, `seo_research.cancel`, `seo_research.retry`, `seo_research.profile_updated`,
  `seo_opportunity.approved`, `seo_opportunity.dismissed`, `seo_opportunity.open`, `seo_opportunity.completed`, `seo_profile.updated`.

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
3. Hard budgets: done in SEO-V2-02.

Until then AnyAPI stays disabled by default and its automation locked. DataForSEO's terms must be reviewed too before any data is shared
between tenants or stored in a global dataset.
