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
