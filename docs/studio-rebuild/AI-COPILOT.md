# Studio Copilot

## Flow

1. User opens the panel (sidebar launcher, Ctrl/⌘J, palette) and asks, or taps a context suggestion.
2. Client sends `content` + `context { siteId: active site, projectId: article open in /studio/content/:id, route }`.
3. Server (`copilot.ts`): validates length; re-checks `siteId`/`projectId` belong to the signed tenant (article's site wins, mismatch → 400); picks a competency (explicit key, or intent match limited to what the context allows and the role permits; none → general answer from page context); stores the question.
4. The competency loader reads tenant-scoped data and returns facts, sources and deterministic findings.
5. Prompt = system rules (use only provided data, never claim actions, SOURCE_DATA_RULES) + page context + evidence, history and question each wrapped as untrusted data (`prompt-injection.ts`).
6. `getTextProvider().generate()`; answer stored with status `completed | failed | cancelled`, provider, model, measured tokens, duration; competency runs also go to `audit_logs` (`copilot.competency.run`).

## Competencies (all read-only)

| Key | Scope | Permission | Reads |
|---|---|---|---|
| `seo-review` | open article | `projects.manage` | latest version → deterministic findings + body |
| `qa-explain` | open article | `projects.manage` | `qa_report`, autonomous gate, last 3 quality repair attempts |
| `publication-status` | site or article | `analytics.read` | last 8 publications with 3 attempts each |
| `workspace-brief` | active site | `analytics.read` | articles by status, failed publications, failed jobs (7 d) |

Mutating actions (regenerate, generate hero image, publish, fix a failed step) are **not** executable from the copilot. It names the screen instead. Adding them needs an approval step (confirm dialog + server-side re-authorization + audit), which is deliberately out of this milestone.

## UI states

Empty (context suggestions) · pending ("Reading the workspace…", `aria-busy`) · completed (Markdown, findings with severity dots, source links that navigate in-app, provider/model/tokens) · failed (plain error, Retry) · cancelled (Stop → "Stopped", Ask again) · history (search, open, delete) · new thread on site switch so answers never mix sites.

## Security

- Tenant from signed headers only; unsigned/forged → 401; API-key mode → 403 (threads are per user).
- Threads and runs filtered by `studioUserId`; foreign ids → 404.
- Untrusted content delimited; model output rendered through an escape-first Markdown subset; only `/studio/…` links become anchors.
- No secrets reach the browser; provider configuration errors are replaced by "The text model is not configured on the server" (details in server log).

## Limitations

- No token streaming: the provider interface is request/response. The panel shows a pending state instead.
- The model is the workspace choice from Settings → AI (DeepSeek, Claude or OpenAI/Codex, all over their APIs); `getTextProvider()` reads it from the request context. Verified with DeepSeek `deepseek-chat` (real answer, 0.9 s). Claude and OpenAI paths are typed and wired but not run here: their keys are not on this machine.
- Model choice and fallback follow the existing single `TEXT_*` configuration; no per-competency model assignment yet.

