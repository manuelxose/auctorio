# Screenshot manifest — STUDIO-01 (2026-11-13)

Captured with Playwright MCP on the CLEAN rebuilt local DB (see db-state-matrix.md), logged in as the local QA account, Studio http://localhost:4420, HEAD `1961e36`. Re-captured after the DB reset; the first set (dirty DB) was overwritten.
Files: `runtime/screens/<route>-<width>.png` (24 files). Routes x widths: overview, site-intelligence, sources, editorial-plan, content, calendar, automation, connections x 1440x900, 1024x768, 390x844.
All 24 landed on their own route (no redirect), every API call 200, zero console errors.

## Comparison with archived evidence (`docs/studio-rebuild/evidence`, 16 files)
- Archive last committed 2026-11-12 (`f6de7fe`, "rebuild shell with copilot…"). Live HEAD is 3 commits later.
- `10-glass-overview-1440.jpg` (archived): full left sidebar nav (Workspace/Editorial/Intelligence/Automation/Distribution groups), 4 KPI tiles, "Destinations" panel.
- `overview-1440.png` (live): top bar + numbered step tabs (Home / Understand the site / Sources / Plan / Produce / Publish), a contextual sidebar with only "Overview", an Assistant (copilot) docked left, 5 KPI tiles, "Today" + "Get started" checklist.
- Verdict: **archived screenshots 01-16 are OUTDATED for Overview/shell** (navigation model changed); not re-compared pixel by pixel for the other 15 files.
- At 390 the copilot is not loaded (no `copilot/*` calls), at 1024/1440 it is.
- Visual/a11y review of the 24 images was not done beyond Overview 1440.
- `screens/studio-04-coverage-1440.jpg`, `-1024.jpg`, `-390.jpg` (live, 2026-11-14): Site Intelligence > Coverage tab for GuiaProgramacionTV after the full recrawl (4245 found / 387 analysed). Captured in the in-app browser pane at emulated widths; images are the pane's scaled view, not native-resolution PNGs. Verdict: no horizontal overflow, table readable; at 390 the section table starts below the fold.
