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

Use repository evidence before assumptions. For codebase, architecture, dependency, or data-flow questions, query Graphify first when `graphify-out/graph.json` exists; use its scoped query/path/explain output to identify the smallest relevant file set. Do not bulk-read generated graph artifacts.

For non-trivial changes: understand → graph discovery → plan → implement narrowly → test → independent review when practical → verify. Preserve repository architecture and unrelated working-tree changes. Select skills and a focused specialist only when they materially help; do not create persistent swarms.

Never hardcode secrets, providers, credentials, or machine-local assumptions. Never claim a check passed unless it was executed. Keep context lean without skipping security, migrations, dependency inspection, or validation. Refresh Graphify after material structural changes.

For UI work, use the existing design system and assess responsive layouts, keyboard/focus behavior, accessibility, loading/empty/error/success states, and light/dark themes where supported. Do not present placeholders or fake metrics as working product behavior.
<!-- END AGENTIC-ENGINEERING-PLATFORM -->
