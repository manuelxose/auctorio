# Studio navigation (M5, 2026-11-17)

One registry, `apps/studio-web/src/app/layout/studio-nav.ts` (`STUDIO_NAV`), drives the area bar, the contextual sidebar and the command palette. Each route appears exactly once (unit test `studio-nav.spec.ts`). The numbered guided flow (step bar, "Next step" footer) was removed in M5.

## Top bar (global)

Sidebar toggle · brand (→ Overview) · site switcher (`AppContextService.switchSite`) · search / command palette (Ctrl/⌘K) · background jobs (live count) · notifications preview · New content · account menu (Profile, Appearance, Log out).

## Area bar (primary)

`Home` · `Calendar` · `Articles` · `Results` · … · `Advanced` · `Settings` (the last two pushed to the far end). The active area has `aria-current=page`; on phones the bar scrolls sideways and the active area is scrolled into view.

## Contextual sidebar (secondary)

The active area's tools, then the assistant (embedded by owner decision; do not reintroduce the right-hand dock without asking).

| Area | Sidebar entries |
|---|---|
| Home | Overview, Notifications |
| Calendar | Calendar (`/studio/calendar`) |
| Articles | Articles (`/studio/content`) |
| Results | Results (`/studio/results`) |
| Advanced | Site · Site intelligence, Competitors · News · Sources (Technical settings is its last section), Inbox · Production · Plan backlog (`/studio/plan`), Review queue (`/studio/review-queue`), Media, Background jobs |
| Settings | Business & brand · Sites · Articles · Mode & rhythm · Integrations · Connections, Web discovery, Assistant tools · Workspace · (admins) People, Roles · (admins) System health · (platform admins) Usage, Workspaces, AI providers |
| Profile (account menu only) | Profile |

Redirects: `/studio/editorial-plan` → `/studio/calendar`, `/studio/editorial-engine` → `/studio/calendar?chip=review`, `/studio/publications` → `/studio/results` (query params kept).

Platform-admin entries are filtered client-side for display only; the server still enforces access. `adminOnly` items are hidden from non-admin roles and their routes send non-admins to Overview (`studioRoleGuard`).

## Keyboard and focus

Ctrl/⌘K palette (Esc closes, focus returns to the trigger) · Ctrl/⌘J toggles the assistant · Arrow/Home/End move between sidebar entries · phone drawer: focus moves in, Esc/backdrop closes, focus returns to the menu button.

## Breakpoints

| Width | Sidebar | Assistant |
|---|---|---|
| ≥ 861 | 332 px column, toggle hides it entirely (preference persisted) | lower part of the sidebar |
| ≤ 860 | drawer | inside the drawer |

Evidence: `evidence/m5/`, e2e `e2e/specs/studio-shell-nav.spec.ts` and `e2e/specs/calendar-m5.spec.ts`.
