# Auctorio Multi-Tenant Client Integrations

## Scope

Auctorio is the editorial control plane. Clients are isolated as independent tenants:

- `tecnoria`
- `guiaprogramaciontv`
- `talkaris`

Each tenant owns its own:

- API key
- sites
- projects
- versions
- assets
- publication jobs
- publishing credentials

## Provisioning

Run the provisioning script from the Auctorio root:

```bash
npx ts-node scripts/provision-linked-tenants.ts
```

The script upserts:

- `tecnoria-main`
- `guiatv-editorial`
- `talkaris-blog`

It also creates tenant API keys only when a tenant does not exist yet.

## Publishing credentials

Site records reference environment variables stored on the Auctorio host:

- `TECNORIA_AUCTORIO_TOKEN`
- `GUIATV_AUCTORIO_ADMIN_KEY`
- `TALKARIS_AUCTORIO_TOKEN`

These references are stored in `Site.publishingCredentialsRef`, not as raw secrets in the database.

## Destination contracts

### Tecnoria

- Site type: `tecnoria`
- Endpoint family: `/api/v1/blog`
- Auth: `Authorization: Bearer <AUCTORIO_PUBLISHER_TOKEN>`
- Supports: `draft`, `publish`, `unpublish`
- SEO fields: `seoTitle`, `seoDescription`

### Guía Programación TV

- Site type: `guiatv`
- Endpoint family: `/blog`
- Auth: `x-admin-key`
- Supports: `draft`, `publish`, `unpublish`
- Rich editorial payload: categories, FAQ, related keys, featured image, SEO

GuíaTV can also **pull** from Auctorio instead of receiving a push — see
[Pull feed](#pull-feed-guía-tv-and-any-other-pull-client) below. The pull feed is the recommended path for
GuíaTV: Auctorio stores the article, GuíaTV syncs it on a schedule and serves it from its own database.

## Pull feed (GuíaTV and any other pull client)

Auctorio exposes its published articles as a read-only feed with the same contract GuíaTV already consumes from
BabyLoveGrowth, so a client has one integration for every producer.

- Base URL: `https://auctorio.com/api/integrations`
- Auth: `X-API-Key: <the tenant's API key>` (the same key the Studio uses). Every response is scoped to that
  tenant, and only published versions (`ContentVersion.publishedAt`) of non-deleted projects are listed.
- `?site=<site key>` narrows the feed to one destination site (e.g. `guiatv-editorial`). Omitted = every site of
  the tenant. An unknown key is a `404 site_not_found`, not an empty list.

### `GET /v1/articles?limit=50&offset=0&site=guiatv-editorial`

Newest first. `limit` is capped at 50. A page shorter than `limit` is the last one.

```json
{
  "items": [
    {
      "id": "0f0c…",
      "slug": "mejores-series-2026",
      "title": "Las 10 mejores series de 2026",
      "publishedAt": "2026-11-09T08:30:00.000Z",
      "languageCode": "es",
      "meta_description": "Las series que llegan en 2026, plataforma por plataforma.",
      "hero_image_url": "https://auctorio.com/assets/covers/series-2026.webp"
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

### `GET /v1/articles/{id}?site=guiatv-editorial`

Adds the body and the structured data:

| Field | Source |
|---|---|
| `content_html` | `ContentVersion.bodyHtml`, sanitized with the editorial allowlist |
| `content_markdown` | Markdown alternative of the same body |
| `meta_description` | `ContentVersion.seoDescription` (falls back to the excerpt) |
| `hero_image_url` | the version's cover, served from `/assets/` |
| `jsonLd` | Schema.org `Article` (headline, dates, image, language, publisher) |
| `faqJsonLd` | Schema.org `FAQPage` from the project's FAQ items, or `null` |
| `languageCode` | `ContentProject.primaryLanguage` |
| `publishedAt` | `ContentVersion.publishedAt` |
| `published_url` | the live URL the publisher reported (`Publication.externalUrl`), or `""` |

`slug` (from the project metadata, falling back to the title) is the **idempotency key**: a client upserts by
slug, so a re-publish updates the same article instead of creating a duplicate, and an unchanged article has the
same body hash and needs no rewrite.

### GuíaTV configuration

Server-side environment on the GuíaTV host (`/etc/guiatv/api.env`):

```bash
AUCTORIO_FEED_API_KEY=<the guiaprogramaciontv tenant key>
AUCTORIO_FEED_BASE_URL=https://auctorio.com/api/integrations
AUCTORIO_FEED_SITE=guiatv-editorial
```

`npm run job:sync-blog` (or the hourly scheduled job) then pages through the feed, stores each article in the
GuíaTV CMS and publishes it as `origin: automated-import`, `reviewedBy: policy:auctorio`. The same job also
consumes the BabyLoveGrowth feed when `BABYLOVEGROWTH_API_KEY` is set; either key alone is enough.

The pull path needs **no** GuíaTV admin key or editorial review key on the Auctorio side: GuíaTV only reads.

The feed key is the `guiaprogramaciontv` tenant's API key. If it is no longer at hand, issue a new one — this
invalidates the current key everywhere, including the Studio:

```bash
npx ts-node scripts/rotate-api-key.ts guiaprogramaciontv   # prints api_key once
```

### Talkaris

- Site type: `talkaris`
- Endpoint family: `/api/v1/ops/blog`
- Public surface: `/blog`, `/blog/:slug`, `/en/blog`, `/en/blog/:slug`
- Auth: `Authorization: Bearer <AUCTORIO_PUBLISHER_TOKEN>`
- Supports: `draft`, `publish`, `unpublish`
- After publish/update/delete, Talkaris queues a sitemap re-ingestion job

## Operational sequence

1. Create the project inside the tenant that owns the destination.
2. Generate content and assets.
3. Approve the latest version.
4. Publish to the tenant site.
5. Validate the public URL.
6. For Talkaris, confirm that an ingestion job has been queued after publication.

## Notes

- The current Studio UI remains tenant-scoped by API key.
- Client isolation is enforced at the data layer; there is no shared customer tenant.
- Cross-tenant human RBAC can be added later without changing the publishing contracts.

## Validation status

Validated on March 11, 2026:

- `tecnoria`, `guiaprogramaciontv` and `talkaris` exist as independent tenants in Auctorio.
- Each tenant authenticates with its own API key and sees only its own site count and project count.
- Draft create/delete smoke tests passed against:
  - Tecnoria
  - Guía Programación TV
  - Talkaris
- Talkaris public blog and sitemap are live behind the production domain.

## Current operational caveat

- Text generation is working in Auctorio.
- The current production image path can still fail with `fetch failed` when SiliconFlow returns a temporary remote asset URL that the VPS cannot fetch.
- This does not block tenant provisioning or publisher connectivity, but it can block the full `generate -> QA -> approve -> publish` flow for projects that require generated imagery.
