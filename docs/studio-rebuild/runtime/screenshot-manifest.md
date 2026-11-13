# Screenshot manifest — STUDIO-01 (2026-11-13)

Captured with Playwright MCP, logged in as local QA account, Studio http://localhost:4420, HEAD `1961e36`.
Files: `runtime/screens/<route>-<width>.png` (24 files). Routes x widths: overview, site-intelligence, sources, editorial-plan, content, calendar, automation, connections x 1440x900, 1024x768, 390x844.
All 24 landed on their own route (no redirect), every API call 200, zero console errors.

## Comparison with archived evidence (`docs/studio-rebuild/evidence`, 16 files)
- Archive last committed 2026-11-12 (`f6de7fe`, "rebuild shell with copilot…"). Live HEAD is 3 commits later.
- `10-glass-overview-1440.jpg` (archived): full left sidebar nav (Workspace/Editorial/Intelligence/Automation/Distribution groups), 4 KPI tiles, "Destinations" panel.
- `overview-1440.png` (live): top bar + numbered step tabs (Home / Understand the site / Sources / Plan / Produce / Publish), a contextual sidebar with only "Overview", an Assistant (copilot) docked left, 5 KPI tiles, "Today" + "Get started" checklist.
- Verdict: **archived screenshots 01-16 are OUTDATED for Overview/shell** (navigation model changed); not re-compared pixel by pixel for the other 15 files.
- Live active site differs per session: the Playwright session opened on site `Auctorio` (manual, disabled); the earlier built-in-browser session was on `GuiaProgramacionTV`. Site selector is per-session state.
- At 390 the copilot is not loaded (no `copilot/*` calls), at 1024/1440 it is.
- Visual/a11y review of the 24 images was not done beyond Overview 1440.
