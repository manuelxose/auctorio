# CLAUDE.md - Auctorio Agent Guide

## Project Context
Auctorio is a content generation and publishing platform using Fastify, Prisma, and BullMQ.

## Behavioral Rules
- **Be Concise**: Minimize token usage by being direct and avoiding fluff.
- **Read First**: Always read a file before editing it.
- **No Unnecessary Files**: Only create files that are essential for the task.
- **Root Protection**: Never save working files or tests to the root folder. Use `/src`, `/tests`, or `/apps`.

## Build & Test Commands
- Build: `npm run build`
- Test: `npm test`
- Typecheck: `npm run typecheck`
- Start API: `npm run start:api`

## Role-Specific Missions

### [ARCHITECT]
Focus on DDD and SOLID principles. Maintain boundaries between `apps/` and shared `packages/` (if any) or internal `src/`.

### [DEVELOPER]
Implement business logic and integrations. Ensure high-quality TypeScript code.

### [TESTER]
Maintain test coverage in `tests/`. Focus on reliability and security.

### [UX/UI]
Owner of the `apps/studio-web` aesthetics. Implement premium, high-impact designs.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

<!-- BEGIN AGENTIC-ENGINEERING-PLATFORM -->
# Managed engineering policy

Use repository evidence before assumptions. For non-local codebase, architecture, dependency, or data-flow questions, query Graphify first when `graphify-out/graph.json` exists; use scoped query/path/explain output to find the smallest relevant source set. Never bulk-read generated graph artifacts.

For non-trivial changes: understand → graph discovery → plan → implement narrowly → test → independent review when practical → verify. Preserve unrelated work. Claude Code may delegate to globally installed native agents; Codex must use its own supported decomposition and review workflow, not Claude agent files.

Never hardcode secrets or claim unexecuted checks. Refresh Graphify after material structural changes. UI work must assess responsive, keyboard/focus, accessibility, and all interaction states.
<!-- END AGENTIC-ENGINEERING-PLATFORM -->
