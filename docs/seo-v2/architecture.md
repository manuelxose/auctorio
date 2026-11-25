# SEO V2 architecture

State after SEO-V2-05.

## Layers

| Layer | File | Responsibility |
|---|---|---|
| Consumers | `src/studio/keyword-metrics.ts`, `keyword-candidates.ts`, `serp-sources.ts`, `youtube-videos.ts`, `web-intelligence.ts` | Ask for a capability and say what decision needs it; degrade without blocking |
| Manager | `src/studio/seo-manager.ts` | The only way to a provider: reuse stored data, buy what is missing, coalesce, queue by priority, record health and circuit |
| Cost Governor | `src/studio/seo-governor.ts` | Budgets, atomic reservations, leases (single flight), settlement, recovery |
| Cache | `src/studio/seo-cache.ts` | Canonical keys in `provider_cache_entries`, field provenance, history, retention |
| Prices, policy | `src/infrastructure/seo/pricing.ts`, `policy.ts` | Versioned price registry; freshness, retention and acquisition policy. Pure |
| Registry | `src/infrastructure/seo/registry.ts` | Providers, modes, selection rules, locks. Pure |
| Contract | `src/infrastructure/seo/contract.ts` | Capabilities, requests, results, quotes, errors, licensing |
| Adapters | `src/infrastructure/seo/dataforseo.ts`, `anyapi.ts`, `web.ts` (Tavily, Firecrawl) | Everything provider-specific |
| Control plane | `src/studio/routes-admin-seo.ts`, Studio → Ajustes → Administración global → Proveedores SEO (`/studio/admin/seo`) | Platform administrators only |

| First-party data | `src/infrastructure/google/search-console.ts`, `src/studio/search-console.ts` | Authorized Search Console access, incremental synchronization |
| Intelligence engine | `src/studio/seo-intelligence/` | Detection, scoring, action selection, explanation, attribution |
| Research engine | `src/studio/seo-research/` | Keyword knowledge, research profile, opportunity reservoir, triggers, durable runs |

The opportunity repository of the owner's diagram is `content_opportunities`; the keyword knowledge is `seo_keyword_metrics` and `site_keywords`.

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

The web capabilities (`web_search`, `web_extract`) have their own providers: `WEB_INTELLIGENCE_PROVIDER` chooses, whatever the mode of the SEO data providers;
*manual* may route them elsewhere. `disabled` and the emergency stop stop them too.

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

## First-party intelligence

1. **Connection.** OAuth with `webmasters.readonly`, PKCE and a single-use state in `social_connection_sessions`, bound to the person who starts it and completed
   by that signed-in person. Only properties of the site's own domain. One refresh token per site, AES-256-GCM.
2. **Synchronization** (`search-console` interval of the control worker). One request lists the final days; each day is then stored once, newest first, then
   forward, then back to 16 months. At most 10 days a run, under a lease per site that fences every write. Retention 500 days.
3. **Datasets.** `site` and `page` are complete; `query` is not (Google hides rare queries, and 5,000 rows a day are kept). Detection of declines and all
   measurements use the complete ones.
4. **Detection** (`detect.ts`, pure). 28-day windows ending on the newest stored day, compared with the previous one, the one before and the year before
   (364 days). Thresholds are in `THRESHOLDS`. Click-through is compared with the site's own other pages by position, device, intent and market.
5. **Scoring** (`scoring.ts`, pure). Weighted geometric mean of the **known** factors; unknown ones leave the formula. `confidence` is separate.
   The same function scores the planner's keywords. Weights by business profile, editable per site (`site_seo_profiles`).
6. **Safeguards** (`select.ts`, pure). One open action per page, technical and cannibalization first, 28-day cooldown, planned duplicates, minimum confidence, holdout.
7. **Explanation** (`OpportunityExplanation`, version 1) is stored with the opportunity and read by Studio, the planner and the assistant (`seo_opportunities`).
8. **Attribution** (`attribution.ts`). Frozen baseline, windows of 28, 56 and 90 days, compared with untouched pages or the holdout. `causal` is always `false`.

Decisions:

- **Search Console does not pass through the cost governor**: it is free and authorized, and it is not a purchase. The emergency stop does stop it; the
  mode *disabled* (paid providers) does not.
- **The engine never calls a provider.** It reads stored data only.
- **Nothing is executed.** Actions on existing pages are tasks for people; only new content goes to the plan, because the plan writes new articles.
  Merging, redirecting, deleting or changing a canonical has no code path; approving a cannibalization needs `review.approve` and `publishing.manage`.
- **Competitor opportunities keep their status**; the engine adds action, score, confidence and explanation.
- **Weights never change on their own.**
- **Google Ads API is not implemented** (optional; no approved credentials). Conversions are reported as unavailable: there is no authorized source.

## Persistent knowledge and research

Conceptual entity -> where it lives:

| Entity | Implementation |
|---|---|
| SEOKeyword, SEOKeywordMetricSnapshot | `seo_keyword_metrics` (tenant, provider, source, country, language, keyword): one row per change, confirmed when it comes back equal |
| SiteKeywordRelationship, SEOKeywordDiscovery, SEOCompetitorKeyword | `site_keywords` and `site_keyword_discoveries` (the discovery of kind `competitor` carries competitor, position and page) |
| SEOKeywordCluster | `site_topic_clusters` (existing); `site_keywords.cluster` |
| SEODomain, SEOCompetitor | `competitors` (existing) and the site's own domain |
| SEOSerpSnapshot, SEOSourceEvidence | `seo_snapshots` and `provider_cache_entries` (existing); `content_opportunities.evidence` |
| SEOMarket | `SeoMarket` in code; locale or country and language in each row |
| SiteOpportunity | `content_opportunities` (existing) plus market, run and reservation |
| SEOResearchRun, SEOResearchTask | `seo_research_runs`, `seo_research_tasks` |
| SEOResearchPolicy, research profile | `site_research_profiles` (`policy`, `derived`, `corrections`) |

1. **Knowledge** (`knowledge.ts`). The manager records every metric it buys, whoever asked: values, provenance per field, completeness, licence at the
   time and retention. Figures of different sources are never merged; a keyword its provider cannot measure may use another source's figures as that source's.
2. **Profile** (`profile.ts`). Derived from stored data, without models or providers, at most once a day. Each field says who says it: corrected,
   configured, approved, observed, detected or unknown. Rebuilding never touches corrections, and corrected topics, exclusions and audience also reach the
   planner and the analysis (`applyCorrections`).
3. **Reservoir** (`reservoir.ts`). The eleven stages and the enrichment level (0-5) are derived from the stored statuses (`stageOf`, `levelOf`), so they cannot
   drift from them. A plan generation reserves its keywords under a lock of the site, variants included, for an hour; the article claims its
   opportunity in the transaction that creates it. Deleted and canceled articles give theirs back; a rejected one drops it.
4. **Triggers** (`triggers.ts`). New market, topic or verified competitor, season, change of own traffic, old evidence, lack of opportunities, pending plan, or a
   person. Each has a key that is never researched twice for the site; lack of opportunities has a cooldown. No trigger looks at the calendar month.
5. **Runs** (`runs.ts`). Tasks are checkpoints: site, first-party data, profile, gaps, purchases, screening, metrics, SERP, inventory. One open run per site (unique
   key), one worker per run (lease). Each purchase stops if there are already enough good opportunities, if the run's limit would be passed, or if the governor
   refuses. Reservations carry the run, and the dispatch statement itself requires it to be running: a pause or a cancellation cannot be raced.
6. **Planning never buys.** It reads the reservoir and stored answers. If they cannot feed the plan and nothing was researched during the cooldown, it asks for a run, waits
   up to 90 s and goes on with what there is; the worker finishes the rest.

Worker: interval `seo-research` of the control worker (`SEO_RESEARCH_INTERVAL_MS`, 60 s). It continues open runs and, where the
platform allows automatic research (off by default), checks each site with recent editorial activity every six hours. Onboarding has a `research` step. Studio: `/studio/seo-research`.

Decisions:

- **No lifecycle column**: eleven stages next to the nine statuses people and the engine already use would be two truths.
- **Search Console queries never enter** `site_keywords`: they stay in their tables and opportunities, and go when the owner deletes them.
- **The own-domain ranking is bought only without Search Console**, and counts within the competitor batches.
- **SERP lookups need a known price**; today DataForSEO's is unknown and AnyAPI is locked, so none is made.
- **The crawl is reused, not started**: indexing is the site index's job.

## Editorial integration

| Consumer | What it uses |
|---|---|
| Editorial plan, Autopilot month, extension, filling slots | Stored opportunities, reserved and claimed; research only when they cannot feed the plan. Never buys by itself |
| Rewriting one proposal, changing a keyword, calendar, plan editing | Stored data only |
| Adding keywords by hand | Measures the new ones (a person asked); without data they stay unmeasured |
| Article, first run | Search results and video: stored, else bought if needed |
| Article, retry, rewrite, revision, *Fix with AI* | What the article already found (`artifacts.research`), else stored data. Fresh data only with `refreshResearch` |
| SEO package, internal links, briefs, images, social, publication, CMS | Nothing external |
| Competitor and source discovery, news discovery, engagement | `web_search`, `web_extract` through the manager |
| Competitor coverage, site index, source pages | Own crawler: free, guarded |
| Assistant, opportunities, competitors, any GET | Stored data |
| Workers | `seo-research` tick (off unless the platform allows it), Search Console sync, article production |

1. **Choosing** (`keyword-candidates.ts`). Approved by a person first; then score, plus 10 for priority topics (plan, site profile), minus 8 for each article already taken of
   the same topic. Excluded topics are dropped. The article keeps `metadata.selection`: `opportunityId`, `researchRunId`, `metrics` (`measured`, `own_data`, `unmeasured`) and `metricsAt`.
2. **Shortage** (`generatedOutput.shortage`): how many came from opportunities, from the model and stayed empty, and what happened with research. A model's keyword is marked as
   unmeasured, carries no figures, and is dropped when the site already covers it.
3. **Asking for research**: a person's plan may; Autopilot's only if the platform allows `automaticResearch`. Priority topics without opportunities are its focus.
4. **SERP** (`serpNeed`): bought for an approved article that is being written, when its topic moves, its plan sources are fewer than the site's target, or no one measured its
   intent. For a moving topic, stored (historical) results are not bought and nothing older than 3 days is used.
5. **Evidence**. A result becomes a source when our crawler has read it (`evidenceKind: page`, `retrievedAt`); unread, it is a lead: title only, and the writer may not state anything
   from it. Order: official, primary documentation, read or validated, leads. The dominant format of the titles reaches the writer as a fixed phrase.
6. **Video**: the site's approved videos, its channel's public feed, stored search results, and a search only if the article calls for a video. Relevance by title; YouTube's oEmbed
   says whether it can be embedded.
7. **Improvements** (`contentType: "update"`, or an approved opportunity) are a new version of the project that published the page, found by its public URL. Automation does not
   start them, they always wait for a person with `review.approve` and `publishing.manage`, and they never count as planned articles (`NEW_CONTENT`). A page not published with
   Auctorio stays a manual task.
8. **Held drafts** (`summary.held`): changes to a public page, and news without a current source. No automation mode publishes them.
9. **Degraded drafts** (`summary.degraded`): `sources_*`, `video_*`, `no_fresh_evidence`, with the reason. Shown in the production panel.
10. **Fetching** (`infrastructure/scraping`): each redirect is checked again, the address is checked when connecting (DNS rebinding), bodies are cut at a limit, and source text cannot
    close its data block in a prompt.

Decisions:

- **Official YouTube Data API is not implemented**: there is no authorized key. oEmbed and the channel feed need none.
- **Time-sensitive web answers last six hours**; older ones are refused, not served as stale.
- **Pages read by third parties (`web_extract`) keep no history.**
