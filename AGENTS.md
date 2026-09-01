# AGENTS.md - Auctorio AI Agents

This project uses a role-based agent system to optimize development and reduce token costs.

## Available Agent Roles

| Role | Mission | Primary Tools |
|------|---------|---------------|
| **Architect** | High-level system design & DDD | Analysis, implementation_plan |
| **Developer** | Implementation & Refactoring | write_to_file, replace_content |
| **Tester** | QA, TDD, and Security | npm test, grep_search |
| **UX/UI** | Visual excellence & UX flow | generate_image (mockups), CSS |

## Optimization Policy
- Use the **Smallest Model** appropriate for the task (e.g., Haiku for simple fixes, Sonnet for architecture).
- **Batch Operations**: Perform multiple related file edits or command runs in a single turn.
- **Context Management**: Use `grep_search` and `list_dir` to find relevant files instead of reading entire directories.

Shared workspace skills are cataloged at `/var/www/.agents/skills/manifest.json`. Load them on demand; use Graphify for cross-cutting work and Vercel/Impeccable only for applicable frontend tasks.

<!-- BEGIN AGENTIC-ENGINEERING-PLATFORM -->
# Managed engineering policy

Use repository evidence before assumptions. For non-local codebase, architecture, dependency, or data-flow questions, query Graphify first when `graphify-out/graph.json` exists; use scoped query/path/explain output to find the smallest relevant source set. Never bulk-read generated graph artifacts.

For non-trivial changes: understand → graph discovery → plan → implement narrowly → test → independent review when practical → verify. Preserve unrelated work. Claude Code may delegate to globally installed native agents; Codex must use its own supported decomposition and review workflow, not Claude agent files.

Never hardcode secrets or claim unexecuted checks. Refresh Graphify after material structural changes. UI work must assess responsive, keyboard/focus, accessibility, and all interaction states.
<!-- END AGENTIC-ENGINEERING-PLATFORM -->
