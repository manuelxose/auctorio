# Studio navigation

## Why the two navigations looked missing (baseline)

Both bars existed in `app-shell.component.ts`, but the design defeated them:

- The top bar held the **sections as horizontal tabs** (Workspace / Publish / Operate), so it was a second menu, not global chrome.
- The left "rail" rendered every group but CSS hid all except the active one on desktop (`.au-sidebar .au-nav:not(.is-current) { display: none }`). It showed 3–6 links that duplicated the active tab.
- Routes outside the three groups (Settings, Notifications) kept showing the previous group's links.
- No collapse, no persistence, no copilot entry, no search, no job status. Below 861 px the tabs disappeared entirely behind a drawer.

Evidence: `evidence/01-baseline-1440.jpg`. The fix replaced the model rather than adding another component: one nav definition (`studio-nav.ts`) drives the sidebar and the palette; the top bar now holds only global context and actions.

## Navigation A: top bar

Sidebar toggle · brand · **site switcher** (`AppContextService.switchSite`) · breadcrumb (group › route `studioMeta.title`) · search / command palette (Ctrl/⌘K) · background jobs (live count from `/operations` counts: running+queued+retrying; red dot when only failures) · notifications (existing) · New content split button · account menu (profile, appearance, log out).

## Navigation B: sidebar

Copilot launcher first (Ctrl/⌘J), then six groups, each entry an implemented route:

| Group | Entries |
|---|---|
| Workspace | Overview, Inbox, Activity |
| Editorial | Content, Editorial plan, Calendar, Editorial engine, Sources, Media |
| Intelligence | Competencies (new), Site intelligence |
| Automation | Autopilot (`/automation`), System health (`/operations`) |
| Distribution | Publications, Publishing, Connections |
| System | Notifications, Settings |

Behaviour: expanded 248 px / collapsed 64 px icon rail with tooltips (hover and keyboard focus); groups fold, and the folded set persists (`localStorage`); collapse state persists, and without a stored preference the rail starts collapsed below 1200 px; Arrow/Home/End move focus between entries; active entry gets the vermilion pencil mark and `aria-current=page`; longest-prefix matching keeps `/studio/content/:id` under Content.

## Breakpoints

| Width | Sidebar | Copilot |
|---|---|---|
| ≥ 1200 | persistent, collapsible | docked column 400 px (560 px "wider") |
| 861–1199 | collapsed rail by default | overlay drawer 440 px with backdrop |
| ≤ 860 | drawer (focus moves in; Esc/backdrop closes; focus returns to the menu button) | full screen |
| ≤ 480 | brand hidden, site name truncated | full screen |
