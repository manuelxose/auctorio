# Auctorio Studio — Design System (Phase 2)

Date: 2026-08-22 · Source: `ux-ui-pro-max` design-system query (Minimalism/Swiss, density 8,
motion 2) + product audit.

## 1. Direction

Calm, dense, operational. No gradients, no glassmorphism, no decorative cards. Tables and
structured lists first. One consistent icon language. Light and dark themes, both
intentionally designed and WCAG AA compliant.

## 2. Color tokens

Semantic tokens only; no raw hex in components.

### Light

| Token | Value |
|---|---|
| `--studio-bg` | `#f8fafc` |
| `--studio-surface` | `#ffffff` |
| `--studio-surface-2` | `#f1f5f9` |
| `--studio-surface-hover` | `#f8fafc` |
| `--studio-surface-selected` | `#eff6ff` |
| `--studio-border` | `#e2e8f0` |
| `--studio-border-strong` | `#cbd5e1` |
| `--studio-text` | `#0f172a` |
| `--studio-text-2` | `#475569` |
| `--studio-muted` | `#64748b` |
| `--studio-brand` | `#2563eb` |
| `--studio-brand-hover` | `#1d4ed8` |
| `--studio-brand-soft` | `#eff6ff` |
| `--studio-on-brand` | `#ffffff` |
| `--studio-success` | `#047857` |
| `--studio-success-soft` | `#ecfdf5` |
| `--studio-warning` | `#92400e` |
| `--studio-warning-soft` | `#fffbeb` |
| `--studio-danger` | `#b91c1c` |
| `--studio-danger-soft` | `#fef2f2` |
| `--studio-info` | `#1d4ed8` |
| `--studio-info-soft` | `#eff6ff` |

### Dark

| Token | Value |
|---|---|
| `--studio-bg` | `#0b1220` |
| `--studio-surface` | `#111a2b` |
| `--studio-surface-2` | `#16213a` |
| `--studio-surface-hover` | `#182542` |
| `--studio-surface-selected` | `#1b2c52` |
| `--studio-border` | `rgba(148, 163, 184, 0.16)` |
| `--studio-border-strong` | `rgba(148, 163, 184, 0.32)` |
| `--studio-text` | `#e8edf5` |
| `--studio-text-2` | `#b8c3d4` |
| `--studio-muted` | `#8b99b0` |
| `--studio-brand` | `#60a5fa` |
| `--studio-brand-hover` | `#93c5fd` |
| `--studio-brand-soft` | `rgba(37, 99, 235, 0.18)` |
| `--studio-on-brand` | `#ffffff` |
| `--studio-success` | `#34d399` |
| `--studio-success-soft` | `rgba(5, 150, 105, 0.16)` |
| `--studio-warning` | `#fbbf24` |
| `--studio-warning-soft` | `rgba(217, 119, 6, 0.16)` |
| `--studio-danger` | `#f87171` |
| `--studio-danger-soft` | `rgba(220, 38, 38, 0.16)` |
| `--studio-info` | `#60a5fa` |
| `--studio-info-soft` | `rgba(37, 99, 235, 0.18)` |

Buttons in dark mode use solid `#2563eb` fill (with `--studio-on-brand` white text) for
contrast; `--studio-brand` is the readable text accent.

## 3. Theming mechanism

- `html[data-theme='light'|'dark']` drives token scope; default (no attribute) = light for
  SSR stability.
- Inline `<script>` in `index.html` sets `data-theme` before first paint from
  `localStorage['auctorio-theme']` (`light`/`dark`/`system` + `matchMedia`).
- `ThemeService` (Angular) exposes `theme()` signal, `setTheme()`, `effectiveTheme()`,
  persists preference, listens to system changes. Switching is instant (attribute flip).
- Both themes maintain ≥ 4.5:1 for body text, ≥ 3:1 for UI states/borders.

## 4. Typography

- Family: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  (system-resolved, no network fetch). Mono: `ui-monospace, SFMono-Regular, Menlo, monospace`.
- Scale:

| Token | Size / line | Use |
|---|---|---|
| `caption` | 11.5px / 1.4 | table headers, timestamps, overline |
| `metadata` | 12.5px / 1.5 | row meta, hints, tags |
| `body-sm` | 13px / 1.55 | table cells, form helpers |
| `body` | 14px / 1.6 | base UI text |
| `section` | 15px / 1.4 | surface titles, nav |
| `card` | 16px / 1.45 | card titles |
| `page-title` | 20px / 1.25, 650 | page H1 |

## 5. Spacing / density

4px base: `--space-1:4 · 2:8 · 3:12 · 4:16 · 5:20 · 6:24 · 7:32 · 8:40`.
Compact paddings: table cells 10–12px vertical; surfaces 16px; page header gap 20px.
Content column: no fixed max-width; pages define `max-width` only for readability-sensitive
forms (`680px`) — tables and grids use available width.

## 6. Radii, borders, shadows, focus

- Radii: `--radius-sm:6`, `--radius-md:10`, `--radius-lg:14`, pill `999px`.
- Borders: 1px `--studio-border` default; `--studio-border-strong` for interactive controls.
- Shadows: none by default; dialogs/popovers `0 8px 24px rgba(15,23,42,.14)` (dark:
  `rgba(0,0,0,.5)`).
- Focus: `:focus-visible { outline: 2px solid var(--studio-brand); outline-offset: 2px }`
  on all interactive elements; never removed.

## 7. Motion

- Transitions 120–200ms ease for hover/state; popovers/drawers 160–200ms.
- `@media (prefers-reduced-motion: reduce)` disables all non-essential motion and
  transitions.

## 8. Iconography

- Single `AppIconComponent` (`app-icon[name]`), 24×24 viewBox, `stroke=currentColor`,
  stroke-width 1.8, round caps/joins (Lucide-style). Names: overview, inbox, plan, content,
  calendar, publications, media, connections, sources, automation, settings, search, plus,
  chevron-down, chevron-right, check, close, dots, external, edit, trash, warning,
  alert-circle, refresh, clock, image, link, globe, user, logout, sun, moon, monitor,
  arrow-up, arrow-down, filter, send, pause, play, eye, copy, sparkles, upload, rss, zap.
- Decorative icons get `aria-hidden`; interactive icon-only controls always carry
  `aria-label`.

## 9. Component inventory (shared)

| Component | Class / selector | Notes |
|---|---|---|
| Button | `.btn` (+`--primary --secondary --ghost --danger --sm --icon --block`, `[disabled]`) | 32px default height |
| Badge | `.badge` (+tone classes) | statuses + counts |
| Input/Select/Textarea/Checkbox/Switch | `.field` `.input` `.select` `.checkbox` `.switch` | labels + hints + errors |
| Tabs | `.tabs` `.tab` | workspace, settings |
| Segmented control | `.segmented` | filters (All/Draft/…) |
| Toolbar | `.toolbar` + `.search` + `.chips` | Search + filters + clear |
| Table | `.table` (+`.table--sortable`, `.table__actions`, `.bulkbar`) | sticky header, hover, selection |
| Pagination | `.pager` | prev/next + page info |
| Empty state | `app-empty-state` | icon, title, description, CTA |
| Skeleton | `app-skeleton` | shimmer rows, reserve space |
| Toast | `app-toast-host` + `ToastService` | success/error/info, auto-dismiss, aria-live |
| Confirm dialog | `app-confirm-dialog` + `ConfirmService` | destructive ops, focus trap, Esc |
| Popover | `app-popover` | site switcher, user menu, row menus |
| Stat | `.stat` `.stat-row` | real metrics only |
| Status badge | `app-status-badge`? (use `.badge` with `statusTone()` helper) | normalized statuses |
| Page header | `.page-header` (+eyebrow/title/subtitle/actions) | every studio page |
| Media thumb | `.media-thumb` | aspect-ratio reserved |

## 10. State language

- Empty: icon + `Title` + actionable sentence + CTA (never "No data").
- Loading: skeletons for lists, inline spinners for isolated updates, `[pending]` on buttons.
- Errors: standard banner — what failed / what is affected / Retry or "Review connection".
- Toasts for completed ops: Saved / Deleted / Scheduled / Published / Verified / Started.
- Confirmations only for destructive/costly ops (delete, disconnect, bulk delete, enabling
  automatic publishing). Never for routine actions.

## 11. CSS architecture

`styles.css` becomes:

```
1–1547   marketing site system (unchanged)
1548+    ── Auctorio Studio design system ──
         tokens (light) / tokens (dark) / base & reset / layout (shell, sidebar, topbar)
         buttons / forms / badges / tables / tabs / toolbar / empty-skeleton / dialogs
         popovers / toasts / stats / page header / utility / responsive
```

Page-level `styles: []` arrays are removed; page templates only use system classes.
`app.css` remains the only global style entry.
