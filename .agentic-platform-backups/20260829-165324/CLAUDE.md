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

Use repository evidence before assumptions. For codebase, architecture, dependency, or data-flow questions, query Graphify first when `graphify-out/graph.json` exists; use its scoped query/path/explain output to identify the smallest relevant file set. Do not bulk-read generated graph artifacts.

For non-trivial changes: understand → graph discovery → plan → implement narrowly → test → independent review when practical → verify. Preserve repository architecture and unrelated working-tree changes. Select skills and a focused specialist only when they materially help; do not create persistent swarms.

Never hardcode secrets, providers, credentials, or machine-local assumptions. Never claim a check passed unless it was executed. Keep context lean without skipping security, migrations, dependency inspection, or validation. Refresh Graphify after material structural changes.

For UI work, use the existing design system and assess responsive layouts, keyboard/focus behavior, accessibility, loading/empty/error/success states, and light/dark themes where supported. Do not present placeholders or fake metrics as working product behavior.
<!-- END AGENTIC-ENGINEERING-PLATFORM -->
