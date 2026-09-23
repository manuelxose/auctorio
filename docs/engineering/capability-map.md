# the workflow tool capability map

Validated on 2026-09-16. This map records capabilities and ownership without
copying protected configuration values.

| Capability | Owner/surface | Evidence | Status |
| --- | --- | --- | --- |
| Project milestones and task state | Native the workflow tool project state | `.wf/wf.db`, M001/S01 plan and task records | PASS |
| Provider-backed planning | the workflow tool `--print` native workflow tools | M001 created; S01 planned through native tools | PASS |
| Task execution | the workflow tool execution route | S01 modules implemented; focused tests passed | PASS, task close checkpoint needs runtime retry |
| Recovery/resume | the workflow tool durable project state | State persisted after planner timeout | PASS for persistence; end-to-end recovery remains pending |
| Code-impact context | Graphify | Scoped query executed; update refused by cache-version guard | PASS query / BLOCKED refresh |
| Focused context | Context Mode bundled doctor/index/search surfaces | Local evidence indexed and retrieved without secret content | PASS |
| Simplicity guardrail | Global Ponytail skill | Applied to avoid new dependencies and unsafe type suppression | PASS |
| Browser validation | Project Playwright/Chromium | Existing smoke validation passed | PASS |
| Secret hygiene | Existing tracked-content scan | No secret values recorded in project evidence | PASS |

The global provider route, credentials, and reusable skill registry remain
outside Auctorio. Auctorio owns only the project context and quality contracts
under `.engineering/` plus the runtime-generated, ignored wf state.
