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
