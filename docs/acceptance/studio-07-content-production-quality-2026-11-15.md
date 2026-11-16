# STUDIO-07 acceptance record (2026-11-15)

Branch `feat/editorial-operating-system` (on top of uncommitted STUDIO-06 work, left untouched). Local DB.

## Findings vs. current code
| Problem | Class | Root cause | Status |
|---|---|---|---|
| English H2s in Spanish articles | CONFIRMED CODE | `structure.ts` template headings were English literals, rendered twice (writer STRUCTURE TEMPLATE + a second copy in `renderBriefForWriter`); the writer copies headings literally | **Fixed**: `localizedHeading` / `renderStructureSpec(spec, language, outline)`; duplicate block removed from `brief-builder.ts` |
| Approved outline only a soft hint | CONFIRMED CODE | Outline lived in "guidance" ("where the structure allows"); QA v2 `outline_coverage` was info-only, count-based, and the pipeline never passed `outline` to QA | **Fixed**: outline replaces template headings as required H2s; QA v2 `outline_coverage` is now an `error` listing each missing heading (token match ≥50%), pipeline passes `metadata.outline` |
| Unparseable writer JSON stored as body | CONFIRMED CODE | `parseWriterOutput` fallback wrapped raw output in `<p>` and it was materialized | **Fixed**: returns `null`; `write` stage does one bounded retry at 8000 tokens, then fails the job with `writer_output_invalid`; no ContentVersion is created; raw output stays only on `ArticleGeneration.articleOutput` (internal) |
| Hero image fails when `topicId` null | HISTORICAL TEST | Already fixed in `1c0448d` (`ensureProjectTopic` in `requestImageGenerationForVersion` / `requestInlineImagesForVersion`); queue failures are kept as `imageRequestError` → operation `partial` | No change; not re-run live |
| Social generator separate | CONFIRMED CODE | Legacy path by design (ADR) | Not migrated (needs equivalence tests first, per prompt) |

## Contract changes
- `parseWriterOutput(raw): ParsedArticle | null` (only caller: `production/stages.ts`).
- `renderStructureSpec(spec, language = "en", plannedOutline = [])`; `WriterPromptInput.plannedOutline?`; `runEditorialQa` input `plannedOutline?`, `language?`.
- New job failure code `writer_output_invalid` (stage `write`, job retryable via existing Retry). Structured log `production.writer_output_invalid`.
- No migrations, no API route changes, no UI changes (Content already shows `errorCode: error` + Retry in `production-status.component.ts`).

## Verification run
- `npm run typecheck`: pass. `npm run build`: pass.
- Targeted `node --test` (production-pipeline, editorial-engine, writer-max-tokens, plan-item-brief-title, publisher-fidelity, prompt-injection, structured-output): 57/57 pass. New: PROD-07a (truncated JSON → `writer_output_invalid`, 2 writer calls, 0 versions; retry → 1 project, 1 clean version), PROD-07b (Spanish plan item: outline H2s required, no English template headings, `outline_coverage` passes), PROD-07c (localized template, missing outline heading blocks QA v2).
- Full suite, run one file at a time with `--test-force-exit` and a 150 s timeout (all files in a single run hung on open handles): 62 files, 492 pass, 1 fail. The failure is `phase5-operations` "duplicate enqueuePublication calls are idempotent": `clearQueue` hit "Job … could not be removed because it is locked by another worker". A local dev publishing worker is consuming the shared Redis queue. The test does not touch the code changed here. This is the environment, not a regression.

## Live run (local DB, site `guiatv-editorial`, es-ES)
Plan item "Cómo leer la programación de TV: guía de horas, canales y emisiones" (guide, 5-entry outline). I set it from `proposed` to `approved` in the local DB, the same state the Approve button sets. The pipeline was called from the rebuilt `dist` (the running API still served pre-change code). Draft only; nothing was published.
1. Outside a workspace context the writer fell back to the `mock` text provider, which returns non-JSON. Job `1a9a4bd6…` → `failed` / stage `write` / `writer_output_invalid` after 2 attempts; **0 ContentVersions**, raw output only on `ArticleGeneration.articleOutput`.
2. Retried the same job inside `withAiTenant` (workspace provider **DeepSeek `deepseek-chat`**), 14 s → `needs_review`, attempts 2, **same project** `6c7d8977…`, 1 version. Title/SEO in Spanish, meta description 152 chars, 983 words, body is HTML (no `{`/`"bodyHtml"`). H2s = the approved outline exactly: «Qué es una parrilla de programación», «Horas, husos y cambios de última hora», «Estreno, repetición y redifusión», «Cómo comprobar una emisión», «Preguntas frecuentes». `outline_coverage` passes; QA score 84; the only failed error check is `image_ready`.
3. Image: request queued with no `imageRequestError` (the project had `topicId` null). The image worker then failed the hero and 3 inline images with `vipspng: libpng read error` (4 visible failed `image_generation` operations, no silent loss). Cause: `IMAGE_PROVIDER=mock` and no workspace image provider, so the mock's placeholder PNG reaches sharp. This is the known STUDIO-01 finding; its fix `162c44f` was reverted as out of scope in `31c13fd`. Not caused by STUDIO-07.
4. With the user's go-ahead, set the workspace image provider (same call Settings → AI makes) to OpenAI. That exposed two real defects, both fixed:
   - `OpenAICompatibleImageProvider` sent `image_size` and `seed` to OpenAI, which rejects unknown fields with 400 "Unknown parameter: 'image_size'". Now `openAiImageBody` sends them only to non-OpenAI compatible providers. Test: `tests/image-provider-body.test.ts`.
   - The OpenAI image model list (`gpt-image-1`, `dall-e-3`) is no longer served to this key (400 "The model 'gpt-image-1' does not exist"; `/v1/models` lists `gpt-image-2`, `gpt-image-1.5`, `gpt-image-1-mini`…). The list and default are now `gpt-image-2` / `gpt-image-1.5` / `gpt-image-1-mini`.
   - Re-requested hero + inline images with `gpt-image-2` after restarting `npm run dev`: hero `done` and attached, 3 inline images `done` and placed in the body, **version QA v2 passed, score 92, no failed error checks**. Draft stays in review; nothing was published.
- Process note: a script that enqueues to BullMQ keeps the Redis handle open and never exits. This is the same cause as the full-suite hang.

## Not run
- Playwright pass of the article editor (no UI changed); `npm test` (runs `prisma migrate deploy`); independent review (skipped by user preference).

## Verdicts
IMPLEMENTATION PASS · FUNCTIONALITY PASS (live: DeepSeek text + OpenAI gpt-image-2 images, QA v2 passed 92) · UX/UI PARTIAL (no UI change; not re-screenshotted) · ACCESSIBILITY PARTIAL (unchanged) · SECURITY PASS (sanitizer still applied; raw output never materialized) · INTEGRATION PASS (pipeline + QA v2 + plan item retry) · REGRESSION PASS (492/493; 1 env failure from a live dev worker on the shared queue) · PRODUCTION READINESS BLOCKED (no deploy/live validation).
