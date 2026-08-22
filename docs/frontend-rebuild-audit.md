# Auctorio Studio — Frontend Rebuild Audit (Phase 0)

Date: 2026-08-22 · HEAD: `9d4321d` (main) · App: `apps/studio-web` (Angular 20.3, SSR)

This document records the fresh audit of the current repository HEAD. Code at HEAD is the
source of truth; older docs (`auctorio-rebuild-status.md`, `studio-simplification-*.md`)
describe superseded states.

---

## 1. Current product architecture

- **Backend**: Fastify + Prisma + BullMQ (`src/`). Domain/application/infrastructure layout,
  8 worker queues (discovery, automation, scheduler, scraping, text, image, publishing, social).
- **Studio BFF**: `apps/studio-web/src/server.ts` — encrypted session cookie, per-request site
  scoping (`x-studio-site-id`), tenant-signed upstream calls.
- **Studio SPA**: Angular 20.3 + SSR (`@angular/ssr`), standalone components, all routes
  lazy-loaded, route-level SEO metadata.
- **Runtime**: systemd `content-ai-studio` → `http://127.0.0.1:4400`, blue/green release dirs
  (`releases/<ts>/`), deployed via `/var/www/bin/publish-frontend-release.sh`.
- **Public marketing site** shares the same app (`PublicShellComponent`, en/es routes).

## 2. Current information architecture

| Route | Surface | Data (BFF `StudioApiService`) |
|---|---|---|
| `/login`, `/forgot-password`, `/reset-password`, `/accept-invite` | Auth | auth providers, password/Google login, invitation accept |
| `/studio/overview` | Operating dashboard | `getOverview`, `getWorkerHealth` |
| `/studio/inbox` | Source-item triage feed | source items, clusters, rewrite actions |
| `/studio/editorial-plan` | AI editorial planning | plans CRUD, bulk approve/reject/delete, inline edit, generate-content-from-row |
| `/studio/content` | Content list | projects (filters: status/goal/origin/search) |
| `/studio/content/new` | Creation flow | create + generate (goal, destination, topics) |
| `/studio/content/:id` | Content workspace | versions, QA/review gate, SEO, history, social, schedule, publish |
| `/studio/calendar` | Publishing calendar | calendar events, reschedule, publish now / cancel / retry |
| `/studio/publications` | Publication operations | publications, attempts, filters, retry, unpublish |
| `/studio/publishing` | Publishing overview/queue | publishing summaries + queued work |
| `/studio/connections` | Destinations + credentials | connections, verification, masked credentials |
| `/studio/media` | Media library | assets, variants, delete/bulk-delete, usage protection, viewer |
| `/studio/sources` | Source management | sources CRUD, health, fetched counts |
| `/studio/automation` | Automation policy | modes, limits, pause/resume, social accounts |
| `/studio/settings/:section` | Settings | profile, sites, users, roles, AI usage, publishing |

Legacy redirects: `dashboard→overview`, `projects→content`, `editorial→content`, `ai→content`,
`assets→media`, `review→content`, `publishing/scheduled→calendar`, `integrations→sources`,
`analytics→overview`.

## 3. Functionality inventory (preserved, real)

- Editorial plan: AI plan generation (period/site/channels/objective/audience/topics), item
  statuses (proposed/approved/generating/content_ready/rejected/canceled), bulk actions,
  inline edit, generate content from approved row.
- Content: create-and-generate, duplication, versions, QA review gate (structured
  blockers/warnings + score), SEO fields, social derivatives (X/Instagram), scheduling,
  publish/update/unpublish, attempt history, retry.
- Media: asset grid with dimensions/variants, lightbox viewer, delete + bulk delete with
  usage protection, unused detection.
- Connections: platform connections, credential configuration (masked, never returned),
  verification, health status.
- Publications: status machine (draft→ready→scheduled→queued→publishing→published/failed/
  unpublished), filters, pagination, retry, failure reasons.
- Calendar: month grid, channel/status filtering, drag-reschedule, published immutability.
- Automation: policy modes (manual/approval/automatic), per-channel limits, pause/resume,
  social account credentials.
- Settings: profile, sites, users/invitations, roles, AI usage, publishing configuration.

## 4. Styling architecture — current state

- One global `src/styles.css` (2 097 lines) contains **two generations**:
  - Lines 1–1547: public marketing site system (dark, glassy, `--bg/--accent` tokens).
  - Lines 1548–2090: studio system (`au-*` classes, light-only).
  - Lines 2090+: Google Sign-In tweaks.
- `src/app/app.css` is empty. No per-component stylesheet strategy: templates are inline in
  `.ts` files; 8 pages embed ad-hoc `styles: [...]` arrays (overview, inbox, content-list,
  content-workspace, publications, calendar, sources, automation).
- Studio tokens exist only for light mode (`--au-*`). **No dark theme, no theme switcher,
  no persistence, no system-preference handling.**
- Hardcoded hex values recur in page styles (e.g., `#f1f5f9`, `#fecaca`, `#dbeafe`,
  `#fdf2f8`) instead of semantic tokens.
- Typography: `Inter` referenced but never loaded — falls back to system sans. Inconsistent
  font sizes (21px page titles, 26px stats, 13.5px body) with no defined scale.

## 5. Application shell — current state

- Sidebar: brand, plain `<select>` site switcher, **10 flat nav items** (no grouping),
  Settings appended below, user name + Log out pinned in sidebar footer.
- Topbar: hamburger (mobile), site tag + route title, `+ New content` button. **New content
  is hidden on mobile** (`display:none` at ≤860px).
- No user popover, no workspace switcher, no collapsed mode, no contextual topbar actions.
- Nav icons: hand-written inline SVG paths in the shell `switch` statement (inconsistent
  stroke language, some paths approximate).

## 6. Cross-cutting UX debt (measured)

| Problem | Evidence |
|---|---|
| Native confirmation dialogs | `window.confirm` in 9 pages (content, editorial-plan, publications, media, sources, calendar, connections, automation, content-workspace) |
| No toast/feedback system | 0 toast components; success/failure communicated by inline banners only |
| No skeletons | 0 skeleton usages; lists render as blank + spinner boot only |
| Inconsistent empty states | 20 `au-empty` usages, plain text, no CTA, no illustration hierarchy |
| Tables not standardized | 5 hand-rolled tables (content, workspace, editorial-plan, publications, sources), different cell padding/labels; no sticky headers; no row actions menu pattern |
| Error language inconsistent | 106 ad-hoc error flags; raw backend messages sometimes surfaced verbatim |
| Modal usage inconsistent | Only media page uses `role="dialog"`; no shared dialog primitive |
| DatePipe unused everywhere | Pages use `toLocaleString` / manual formatting; no shared date utility |
| Focus visibility | Inputs have focus outline; **buttons/tabs/links have no `:focus-visible` styles** |
| Reduced motion | Not respected (only spinner animation exists) |
| Icon-only controls | Some lack `aria-label` (e.g., row action buttons rely on text or nothing) |
| Contrast | `--au-faint` (#9ca3af on white ≈ 2.9:1) used for metadata text — fails WCAG AA |
| Mobile action loss | Topbar New content hidden; several row actions become ambiguous |

## 7. Performance baseline

- `npm run typecheck` — **pass**. `npm run build:studio` — **pass**, zero warnings.
- Initial bundle: **420.74 kB raw / 108.93 kB transfer** (budget warn 500 kB / error 1 MB).
- Largest lazy chunks: workspace 35.6 kB, calendar 23.5 kB, automation 22.9 kB.
- No layout-shift protection: no image aspect ratios reserved in lists, no skeleton
  placeholders; full-screen boot spinner only at shell level.
- API call patterns: overview refreshes every 45 s with 2 calls; lists re-fetch on action
  completion (fine). No obvious N+1 in the client.
- No external fonts/icons downloaded (self-contained) — positive.

## 8. Accessibility baseline

- Semantic headings/buttons mostly present; nav is `<nav aria-label>`.
- Missing: dialog focus trapping, escape handling, aria live announcements for async state
  changes, visible focus on non-input controls, dark-mode contrast pass, `prefers-reduced-motion`.

## 9. Dead / duplicated frontend code

- `src/app/app.css` — empty file.
- `app.routes.ts` — duplicate `automation` redirect after the real route (unreachable, dead).
- Marketing and studio styles coexist in one file; marketing classes leak into studio
  context (e.g., `.au-tag` used by both, but `--au-*` only defined for studio root).
- Leftover studio classes with single usage or unused variants (`au-form__actions` partially,
  `au-select` wrapper, `au-surface--padded` conventions applied inconsistently).

## 10. Known constraints

- QA login: password login supported (`/studio/api/auth/login/password`, scrypt). E2E creds
  come from env. Visual QA requires a local QA account password (to be provisioned via a
  repo script using `hashStudioPassword`).
- Dry-run publishing (`PUBLISH_DRY_RUN`) must not be misrepresented in UI states.
- Build budget: keep initial bundle ≤ 500 kB warning threshold.
