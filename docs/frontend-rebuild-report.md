# Auctorio Studio — Frontend Rebuild Report

Date: 2026-08-22 · HEAD before: `9d4321d` · Delivered in `apps/studio-web` · Deployed to production release rotation.

## Before — major frontend problems

- **No theme system**: studio was light-only; the shared stylesheet mixed two generations (public marketing dark system + studio `au-*` system) in one 2 097-line file.
- **Flat shell**: 10 ungrouped nav items, plain `<select>` site switcher, user name + Log out pinned in the sidebar, topbar limited to route title + one button (hidden on mobile).
- **Inconsistent primitives**: 8 pages shipped ad-hoc `styles: []` arrays; 5 hand-rolled tables; no skeletons, no toast system; `window.confirm` in 9 pages; only one `aria-modal` dialog; no `:focus-visible` styles; date formatting duplicated per page.
- **SSR boot overlay never dismissed**: `index.html` waits for an `auctorio:studio-ready` event that no component dispatched after the simplification commit — the dark loading overlay covered every studio page after load.
- **Weak empty/loading/error language**: "No data"-style states, blank list loads, raw backend messages surfaced verbatim in places.

## Architecture — what changed and why

- Single design-system layer in `styles.css` ("Auctorio Studio design system v2"): semantic tokens, light + dark themes, base, layout, components, utilities, responsive, reduced-motion. Page-level `styles: []` arrays removed.
- Token scope at `:root`; `html[data-theme]` drives themes; inline `index.html` script sets the theme before first paint (no FOUC); `ThemeService` persists `light|dark|system` and reacts to OS changes.
- Shared UI primitives under `src/app/components/ui/`:
  - `app-icon` — single Lucide-style 24×24 stroke icon system (~50 icons).
  - `app-popover` — anchored popover used by site switcher, user menu, quick-create and every row menu.
  - `app-empty-state`, `app-toast-host` + `ToastService`, `app-confirm-dialog` + `ConfirmService` (focus trap, Esc, aria-modal).
- Toast + confirm hosts mounted once in the app root; SSR-safe (browser-gated DOM listeners — this fixed 2 failing SSR tests).
- Legacy routes kept; dead duplicate `automation` redirect removed.

## UX — navigation and workflow improvements

- Sidebar grouped into **Workspace / Publish / Operate / System**, reinforcing the Sources → Inbox → Plan → Content → Calendar → Publications lifecycle.
- Site switcher is a popover with identity initials, per-site role and a settings shortcut.
- User menu: profile, sites, appearance (light/dark/system), logout.
- Topbar: contextual title, split primary action "New content" with quick-create menu (article / editorial plan / source).
- Overview became an operating dashboard: real stats, a computed **Needs attention** list (failures, paused automation, unhealthy connections, failing sources), upcoming publishing agenda, pipeline, destination health, plan coverage, worker health.
- Content list: quick state filters (All/Draft/Review/Ready/Published/Failed) via `contentFilterOf`, search, bulk bar, per-row action menus (no button walls).
- Editorial plan: generate → saved plans → detailed table with bulk approve/reject/delete, inline editing, per-row "Generate content", channel badges and explicit "planning ≠ writing" messaging.
- Publications: full filter bar, row menus with Details/Retry/Publish now/Cancel/Unpublish/Delete, detail panel with attempt history and schedule editing.
- Connections: platform cards with verification, enable/disable, masked credential state ("Configured securely").
- Automation: radio-card modes (Manual / Approval required / Automatic) with explicit consequences, automatic-mode safety banner, pause/resume with confirmation.
- All destructive operations now use the shared confirm dialog; completed operations use toasts; lists use skeletons; every collection has an intentional empty state with a CTA.

## UI — design system changes

- Tokens: 26 light + 26 dark semantic tokens; spacing scale 4–32px; type scale 11.5–20px; radii 6/10/14px.
- Typography: system Inter stack (no network fetch), mono for editor/diff/credentials.
- Statuses normalized to badge tones (`au-badge--success|warning|danger|brand|neutral`) with `statusTone`-style helpers; channels use `au-channel` badges.
- Tables: sticky headers, hover, selection, bulk bar, row menus, horizontal overflow, pager.
- Motion: 120–200ms transitions; `prefers-reduced-motion` respected; no decorative animation.
- Accessibility: `:focus-visible` on all interactive controls, aria-labels on icon buttons, `role=dialog`/`aria-modal` confirm dialog with focus management, `aria-live` toasts, 44px touch targets on mobile.

## Route matrix

| Route | Final state |
|---|---|
| `/login`, auth lifecycle | New system, theme toggle, honest Google fallback |
| `/studio/overview` | Operating dashboard (attention list, agenda, health) |
| `/studio/inbox` | Triage feed: badges, score, site selector, rewrite/dismiss, clusters tab |
| `/studio/editorial-plan` | Generate form + saved plans + full table with bulk/inline editing |
| `/studio/content` | Segmented filters + table + bulk bar + row menus |
| `/studio/content/new` | Compact creation form with advanced disclosure |
| `/studio/content/:id` | Workspace: tabs, right rail (Quality + Publishing), readiness strip, schedule table |
| `/studio/calendar` | List/day/week/month, drag-reschedule, create-from-calendar, published immutability |
| `/studio/publications` | Operational table + detail panel + attempt history |
| `/studio/publishing` | Queue/published/destinations cockpit |
| `/studio/connections` | Destination cards + secure credential handling |
| `/studio/media` | Grid, viewer lightbox (Esc), bulk delete with usage protection |
| `/studio/sources` | Form + table + row menus (test/fetch/toggle/edit/delete) |
| `/studio/automation` | Mode cards, volume/limits/windows, pause/resume, social accounts |
| `/studio/settings/*` | Persistent section nav: Profile, Sites, Users, Roles, AI usage |

All 17 authenticated routes verified in-browser at 1440×900 with **zero console errors and zero horizontal overflow**; verified again at 375×812 (off-canvas drawer, toggle visible, no overflow).

## Mobile strategy

- <860px: sidebar becomes overlay drawer + backdrop (transform-based); topbar keeps primary action; dialogs become bottom sheets; tables scroll horizontally in wrappers; grids collapse to 1–2 columns; touch targets ≥44px.
- Tested at 375px across overview/content/editorial-plan/publications/media/connections/automation.

## Accessibility

- Fixed: visible focus everywhere, icon-button labels, dialog semantics + focus trap + Esc, reduced-motion, contrast tokens (light and dark), aria-live toasts, semantic nav landmarks.
- Remaining gaps: no full screen-reader pass; calendar drag-and-drop is pointer-only (acceptable, rescheduling also available via datetime inputs).

## Performance

| Metric | Before | After |
|---|---|---|
| Initial bundle (raw) | 420.74 kB | 466.83 kB |
| Initial transfer | 108.93 kB | 119.32 kB |
| Budget | 500 kB warn / 1 MB error | No warnings |
| Lazy routes | 32 chunks | Preserved (all pages lazy) |

The +46 kB initial is the shared shell/UI system (icons, popover, toast, confirm, theme). Page chunks stayed flat. No new dependencies added (zero npm changes). Lazy loading, SSR and hydration retained.

## Removed code

- 550 lines of legacy studio CSS replaced by the new system (~1 100 lines, complete inventory).
- 8 inline `styles: []` arrays across pages.
- Dead `automation` redirect in `app.routes.ts`.
- Hand-written nav icon `switch` in the shell (replaced by the icon system).
- `window.confirm` everywhere (9 pages) — replaced by the confirm dialog.

## Tests

Commands run and results:

- `npm run typecheck` — pass
- `npm run build` — pass
- `npm run build:studio` — pass (zero warnings, budget green)
- `node --test dist/tests/**/*.test.js` — **68/68 pass** (2 SSR failures introduced by ungated DOM listeners were fixed by browser-gating)
- Playwright E2E against production HTTPS (`e2e/specs/studio-workflow.spec.ts`): **3/3 pass** (selectors updated for the new "New content" label)
- Browser QA: 17 routes × 2 viewports, themes, site switcher, user menu, row menus, confirm dialog (focus/Esc), toasts, mobile drawer — all verified with real backend data.

## Remaining issues

- E2E cannot run over plain HTTP locally because the production session cookie is `Secure` (harness constraint, not a product issue).
- The Playwright browser automation in this session had stalled `requestAnimationFrame`, so interaction checks used programmatic clicks; the deployed app was additionally verified by the real E2E suite.
- Calendar drag-and-drop has no touch fallback (datetime inputs cover the same capability).
- Command palette (⌘K) was evaluated and deferred — navigation is now discoverable without it.
