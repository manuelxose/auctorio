# Studio Simplification — Deletion Report

Date: 2026-08-21
Net diff: **+1,947 / −19,777 lines** across 56 files.

## Deleted routes (28 old Studio routes removed; redirects installed)

| Old route | Fate |
|-----------|------|
| `/studio/dashboard`, `/studio/projects*` | → `/studio/content` (or overview) |
| `/studio/editorial/*` (pipeline, calendar, briefs, articles, versions) | → `/studio/content` |
| `/studio/ai/*` (text-generation, image-generation, prompts) | → `/studio/content` |
| `/studio/assets/*` (images, library) | → `/studio/media` |
| `/studio/review/*` (qa, editor) | → `/studio/content?filter=review` target `/studio/content` |
| `/studio/publishing/history`, `/studio/publishing/scheduled`, `/studio/publishing/destinations` | merged → `/studio/publishing` |
| `/studio/integrations/*`, `/studio/automation/*`, `/studio/analytics/*` | → `/studio/settings/sites`, `/studio/publishing`, `/studio/overview` |
| `/studio/workspace/*`, `/studio/users`, `/studio/roles` | → `/studio/settings` |
| `/studio/login`, `/studio/ops-login` | → `/login` (single login) |

## Deleted pages (23)

analytics, automation-pipelines, deployments, editor-review, editorial-calendar,
editorial-pipeline, editorial-versions, image-generation, integrations, logs,
media-library, prompt-library, project-detail, projects, qa-queue, roles,
scheduled, sites, text-generation, users, version-compare, workspace-settings,
dashboard.

## Deleted components (5)

studio-empty-state, studio-page-header, studio-side-panel, studio-stat-strip,
studio-table-shell. (auctorio-chat-widget kept: used by the marketing shell.)

## Deleted services / guards / utils

- `services/studio-session.service.ts` (replaced by `services/app-context.service.ts`)
- `guards/studio-auth.guard.ts` (replaced by `guards/studio-guards.ts`)
- `studio/studio-navigation.ts` (navigation table)
- `utils/api-error.ts`, `utils/project-brief.ts`, `utils/review-gate.ts`

## Removed auth flows from the UI

- workspace discovery before login (`/auth/login/options` no longer called)
- workspace selection cards, active-session continuation, launch access, request-access
- multi-workspace auth states, OIDC/SSO explanations, permission counts, auth-mode labels
- Command Palette control (never implemented)

## Merged pages

| Before | After |
|--------|-------|
| Projects / Pipeline / Briefs / Articles / Versions / Text Gen / QA / Editor Review | **Content** (list + filters + workspace tabs Content/Media/SEO/History) |
| Assets / Images / Image Generation / Media Library | **Media** |
| Destinations / Scheduled / History | **Publishing** (Queue / Published / Destinations) |
| Users / Roles / Workspace settings | **Settings → Team / Sites / Profile** |
| Prompt Library / Integrations / Analytics surfaces | **Settings → AI / Sites**; analytics → Overview |

## Obsolete styles

- Entire `console-*` design vocabulary removed from `src/styles.css` (677 class usages, ~2,060 lines). Marketing styles preserved.
- New `au-*` design system (~500 lines) added.

## Login UI reduction

- Before: email lookup → workspace discovery → password/Google/OIDC → workspace selection → invitation/reset/launch states, 3 route aliases.
- After: one screen, email + password + [Sign in], optional Google, forgot-password link. Separate small pages for `/forgot-password`, `/reset-password`, `/accept-invite`.

## Metrics

- Studio primary navigation: ~20 surfaces → **5 items** (Overview, Content, Media, Publishing, Settings).
- Studio pages: 35 → **20** (14 marketing/auth + 6 studio pages).
- Login screens: 1 primary screen, 2 inputs, 1 CTA.
- Create content: 1 screen before generation starts.
- Article → publish: one workspace (tabs + rail), no module hopping.
- Initial bundle: Studio production build clean; lazy routes retained.
