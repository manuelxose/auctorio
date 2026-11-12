# Studio design system: glass

Extends `docs/auctorio-design-system.md`. Applies to the Studio only (`.au-app`); the public marketing site keeps its own look. All Studio rules live at the end of `apps/studio-web/src/styles.css` ("Studio glass").

## Inputs

- **ui-ux-pro-max**: `--design-system "editorial SaaS dashboard data-dense"` (density 8, motion 2) for spacing and density; `glassmorphism dashboard --domain style` for the glass recipe (blur 10–20 px, translucent surfaces, 1 px light edge, contrast ≥ 4.5); `data table` and `wizard multi-step` UX guidance (horizontal scroll or cards on mobile, visible step progress, back and skip).
- **unslop** by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0, run in **polish mode**: glassmorphism is the product's chosen brand (confirmed by the owner), so it stays; only the slop around it was removed.

## Direction

- Product: Auctorio plans, writes, checks and publishes articles for a team's own sites.
- Character: exact, editorial, luminous.
- World: a proof desk under a skylight, with frosted glass over paper.
- Moments: the light behind the glass (a quiet wash of the brand's own inks), the article and the copilot's evidenced answer.
- Signature: the vermilion pencil mark on the active sidebar entry, used nowhere else in the chrome.

## Glass rules

| Token / rule | Light | Dark |
|---|---|---|
| Background | `#eceae4` + three radial washes: indigo 0.20, vermilion 0.12, teal 0.13 | `#0e0d18` + indigo 0.30, vermilion 0.12, teal 0.12 |
| Card surface `--au-surface` | white 60 % | `rgba(30,29,54,.56)` |
| Chrome `--au-surface-chrome` (top bar, sidebar, copilot) | white 56 % | `rgba(24,23,44,.58)` |
| Popovers / palette `--au-surface-pop` | white 86 % | `rgba(30,29,54,.90)` |
| Blur | 18 px cards, 26 px chrome, saturate 170 % | same |
| Edge | 1 px hairline + inset top highlight `--au-glass-edge` | same, at 8 % |
| Shadow | neutral, 8–28 px soft; no colored shadows | neutral, darker |

- Blur sits on a `::before` layer at `z-index:-1`, never on the element, so fixed popovers inside a panel keep their position.
- The top bar, sidebar and copilot float as 16 px-radius panels with a 12 px gap (8 px on phones).
- `prefers-reduced-transparency` swaps every glass surface for a solid one.
- Removed as slop: indigo→violet gradient buttons and avatar, colored brand shadow, five-colour blob mesh (replaced by three brand inks at lower strength), greeting headline, uppercase tracked eyebrows and table headers.

## Shared components added in this pass

- **Stepper** (`.au-stepper` / `.au-step` with `is-done`, `is-current`, `is-failed`): numbered dots joined by a progress track. Used by the connection wizard and the article pipeline (`utils/article-pipeline.ts`, driven by the review gate so it never contradicts the status badge).
- **Magic connect** (`components/connect-box.component.ts`, `.au-magic`): one field that accepts a domain, a profile link or an @handle. It detects the destination live (`utils/connect-target.ts`) and opens the wizard already started.
- **Tables**: sentence-case headers on a frosted sticky header, 12 px cells, hover, focus-within and selected states that read apart, tabular numbers, `au-num` right alignment, card layout under 760 px with sentence-case labels.
- **Detail grid** (`dl.au-detail-grid`): two aligned columns of facts, one column on phones.
- **Search field** for bare `.au-search__input`: a proper field box; the icon no longer covers the text.

## Not done

Page-level polish of every Studio screen (they inherit the new glass, tables and stepper but keep their own card layouts); initial bundle 516.5 kB against a 500 kB budget (global CSS).
