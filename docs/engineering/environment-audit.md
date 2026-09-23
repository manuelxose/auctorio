# Environment audit

Captured on 2026-09-15 from read-only probes in the Auctorio checkout. Values
and credentials from environment files were not read or recorded.

| component | current state | version | status | action required |
| --- | --- | --- | --- | --- |
| Host OS | WSL2 Linux (`5.15.153.1-microsoft-standard-WSL2`, x86_64) | Linux 5.15.153.1 | AVAILABLE | None. |
| Shell | zsh is the configured shell | `/usr/bin/zsh` | AVAILABLE | None. |
| VS Code | VS Code Remote CLI is on `PATH`; its non-terminal invocation reports it is available only in WSL or a VS Code terminal | Remote CLI path present | AVAILABLE | Run editor-dependent checks inside a VS Code terminal when needed. |
| Git | One linked worktree: this Auctorio checkout | 2.43.0 | AVAILABLE | Preserve the shared dirty checkout. |
| Node.js | Installed host runtime | 24.13.0 | AVAILABLE | CI uses Node 22; validate any Node-sensitive change in CI or with Node 22. |
| npm | Installed package manager; `package-lock.json` is present | 11.6.2 | AVAILABLE | Use `npm ci` for reproducible CI installs. |
| pnpm | Command not found | MISSING | MISSING | No action: the project is npm/lockfile based. |
| Yarn | Command not found | MISSING | MISSING | No action: the project is npm/lockfile based. |
| Python | `python3` is installed | 3.12.3 | AVAILABLE | None. |
| Docker Engine | Docker CLI is installed | 29.7.2 | AVAILABLE | None. |
| Docker Compose | Docker Compose plugin is installed | 5.5.0 | AVAILABLE | None. |
| GSD CLI | `gsd` command not found; project SDD artifacts exist under `.superpowers/sdd/` | MISSING | MISSING | Use the installed Codex GSD workflow/skills; do not install a duplicate CLI during this baseline task. |
| Pi CLI | `pi` command not found | MISSING | MISSING | No action in this audit; later bootstrap work must choose its installation path explicitly. |
| Graphify | CLI and current `graphify-out/graph.json` are present | 0.9.53 | AVAILABLE | Query the graph before broad codebase investigation and refresh it after structural code changes. |
| Context Mode | Connected MCP tools are available in this session; no standalone `context-mode` command is on `PATH` | MCP version not exposed | AVAILABLE | Use the MCP tools; no CLI installation needed. |
| Playwright CLI | Standalone `playwright` command not found | MISSING | MISSING | Invoke the project-local runner through `npm run test:e2e`/`npx playwright`. |
| Project Playwright | `@playwright/test` is installed and `e2e/playwright.config.ts` exists | 1.62.1 | AVAILABLE | Browser runtime availability was not exercised in this documentation-only task. |
| Auctorio environment template | Tracked `.env.example` is present; identifiers cover database, Redis, text/image, social, web-intelligence, studio, and source-provider configuration | N/A | AVAILABLE | Treat variable names as configuration requirements only; credential presence was not checked. |
| Provider credentials | Environment-variable identifiers exist for multiple providers (including text/image, social, web intelligence, Google, media, and SiliconFlow) | N/A | UNVERIFIED | Configure and validate credentials only through the project’s approved secret-management path. |

## Evidence and limits

- `git worktree list` reports only `/home/manuelxose/workspace/auctorio` at
  commit `3ed9eb8` on `main`.
- Package inspection reports local `@playwright/test@1.62.1`; it does not
  establish that browsers are installed or that an E2E target is reachable.
- This audit used only command availability and tracked configuration/template
  structure. It did not print environment values, inspect secret stores, start
  services, install tools, or modify host configuration.
