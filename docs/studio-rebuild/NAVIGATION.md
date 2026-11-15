# Studio navigation (current, STUDIO-09, 2026-11-15)

One registry, `apps/studio-web/src/app/layout/studio-nav.ts` (`STUDIO_NAV`), drives the area bar, the contextual sidebar, the step bar / "Next step" footer and the command palette. Each route appears exactly once (unit test `studio-nav.spec.ts`).

## Top bar (global)

Sidebar toggle · brand (→ Overview) · site switcher (`AppContextService.switchSite`) · search / command palette (Ctrl/⌘K) · background jobs (live count) · notifications preview · New content (the only "New content" in the shell; Overview no longer repeats it) · account menu (Profile, Appearance, Log out).

## Area bar (primary)

`Home` · `1 Understand the site` · `2 Sources` · `3 Plan` · `4 Produce` · `5 Publish` · … · `Settings` (pushed to the far end, outside the numbered flow). The active area has `aria-current=page`; on phones the bar scrolls sideways and the active area is scrolled into view on every page activation.

## Contextual sidebar (secondary)

The active area's tools, then the assistant (embedded by owner decision — the right-hand dock was reverted in `ff50b77`; do not reintroduce it without asking).

| Area | Sidebar entries |
|---|---|
| Home | Overview, Notifications, Background jobs |
| Understand the site | Site intelligence, Competitors |
| Sources | Sources, Inbox |
| Plan | Editorial plan |
| Produce | Content, Review queue, Media |
| Publish | Calendar, Publications |
| Settings | Sites, (admins) People, (admins) Roles, Connections, Web discovery, Autopilot (read-only for non-admins), Assistant tools · (admins) System health · (platform admins) Usage, Workspaces, AI providers |
| Profile (account menu only) | Profile |

Platform-admin entries are filtered client-side for display only; the server still enforces access. Since STUDIO-10, `adminOnly` items (People, Roles, System health) are hidden from non-admin workspace roles in the sidebar and the command palette, their routes send non-admins to Overview (`studioRoleGuard` with `requiredRole` / `adminSections`), and the API answers 403 without `workspace.manage` for worker, queue, metrics, cost and preflight reads.

## Keyboard and focus

Ctrl/⌘K palette (Esc closes, focus returns to the trigger) · Ctrl/⌘J toggles the assistant (closing returns focus to the "Assistant" launcher) · Arrow/Home/End move between sidebar entries · phone drawer: focus moves in, Esc/backdrop closes, focus returns to the menu button.

## Breakpoints

| Width | Sidebar | Assistant |
|---|---|---|
| ≥ 861 | 332 px column, toggle hides it entirely (preference persisted) | lower part of the sidebar; area tools stay on top (max 46 % height, scrolls) |
| ≤ 860 | drawer | inside the drawer |

Evidence: `evidence/studio-09/` (before vs after at 1440/1024/390), e2e `e2e/specs/studio-shell-nav.spec.ts`.
