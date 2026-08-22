# Auctorio Studio — Frontend Information Architecture (Phase 1)

Date: 2026-08-22

## 1. Product loop the UI must reinforce

```
Sources → Inbox/Discovery → Editorial Plan → Content production → Media → Review
→ Scheduling → Publishing → Feedback (Publications/Overview)
```

Connections (destinations), Automation and Settings support this loop. The navigation must
make this lifecycle readable, not a flat list of admin pages.

## 2. Studio navigation hierarchy

```
WORKSPACE
  Overview          /studio/overview
  Inbox             /studio/inbox
  Editorial Plan    /studio/editorial-plan
  Content           /studio/content
  Calendar          /studio/calendar

PUBLISH
  Publications      /studio/publications
  Media             /studio/media
  Connections       /studio/connections

OPERATE
  Sources           /studio/sources
  Automation        /studio/automation

SYSTEM
  Settings          /studio/settings/profile
```

`/studio/publishing` remains a route (publication queue cockpit) but is reachable from
Publications and Overview instead of holding its own sidebar slot; the redirect rules are
kept for compatibility.

## 3. Route responsibilities

| Route | Job | Primary action |
|---|---|---|
| Overview | "What needs my attention now?" | Jump to the failing/next item |
| Inbox | Triage discovered stories into content | Rewrite as article / add to plan / dismiss |
| Editorial Plan | Decide what to publish before writing | Generate plan (AI) / approve rows |
| Content | Produce and review editorial work | New content / open workspace |
| Calendar | See and move the publishing timeline | Open slot / reschedule |
| Publications | Operational state of every publish | Retry / inspect attempt / unpublish |
| Media | Manage assets | Preview / delete safely |
| Connections | Manage destinations + credentials | Configure / verify / disconnect |
| Sources | Configure content acquisition | Add source / toggle / refetch |
| Automation | Govern autonomous behavior | Change mode (with explicit risk) |
| Settings | Account, sites, users, roles, AI, publishing | Sectioned, simple |

## 4. Global actions

- **New content** (primary, always available): `/studio/content/new`.
- Quick-create menu attached to the primary action:
  - New article → `/studio/content/new`
  - Generate editorial plan → `/studio/editorial-plan` (focuses the generate form)
  - Add source → `/studio/sources`
  - Upload media → `/studio/media` (if upload is supported; otherwise omitted)
- Site switcher (sidebar top): switch active site; shows name, type icon; settings
  shortcut to `/studio/settings/sites`.
- User menu (sidebar bottom): profile → `/studio/settings/profile`, sites, logout.
- Command palette (`Ctrl/Cmd+K`): optional; deferred unless navigation proves insufficient.

## 5. Cross-screen workflows

1. **Story → publish**: Inbox → Rewrite → Content workspace (generate) → Review → Schedule
   → Calendar/Publications → Published.
2. **Planned → content**: Editorial Plan → approve row → Generate content (per row) →
   Content workspace.
3. **Failure → recovery**: Overview attention list / Publications failed filter → open
   publication → View attempt → Retry or fix connection (→ Connections).
4. **Acquisition**: Sources → Inbox (automatic discovery) → Editorial Plan.
5. **Autonomy**: Automation mode set → Sources enabled → workers fill plan/slots →
   Publications/Overview report.

Every list-to-detail transition uses `routerLink` deep links (already supported).

## 6. Settings hierarchy

`/studio/settings/:section` with persistent section navigation:

```
Profile       profile
Sites         sites
Users         users (admin)
Roles         roles (admin)
AI            ai      (provider/model/usage/cost/limits)
Publishing    publishing
```

Only sections backed by real endpoints are shown; role-gated sections are hidden for
non-admins (guard already exists).

## 7. Layout rules

- Desktop: persistent 232px sidebar + topbar + content area (max width removed; grid pages
  may span wide). Detail/workbench screens may use a two-pane layout.
- Mobile (<860px): sidebar becomes an overlay drawer with backdrop; topbar keeps context +
  primary action; tables degrade to horizontal-scroll or card lists; modals become full
  sheets; all touch targets ≥ 44px.
- Tables are the default for homogeneous record lists (content, publications, editorial
  plan, sources); cards reserved for genuinely independent objects (connections, media
  assets) and narrow-screen fallbacks.
