# ADR: One governed production pipeline

Status: accepted (2026-11-12)

## Context

Before this change Auctorio produced articles through two unrelated paths.

**(a) Plan item to content.** `generateContentFromEditorialPlanItem` (`src/studio/editorial-plan.ts`)
flattens the plan item into a Spanish text brief, calls `createProject` and then
`startProjectGeneration` (`orchestration.ts`). That enqueues a `queue_text` job: the text worker
writes free text, `syncTextResultToStudio` turns it into HTML with a naive paragraph splitter, a
hero image is queued, and `syncImageResultToStudio` runs `runVersionQaV2` (`qa.ts`). Autopilot
projects then go through `quality-gate.ts` / `quality-repair.ts`. The path has no fact ledger, no
duplicate check and no provenance. Its only durable tracking is one `Operation` per queue job.

**(b) Story cluster to Editorial Engine.** `generateArticleFromCluster`
(`editorial-engine/orchestrator.ts`) runs everything in process: duplicate decision
(`duplicate-check.ts`), classification, fact safety (`fact-safety.ts`), site knowledge and site
value, a structured `EditorialBrief` (`brief-builder.ts`), the writer prompt (`writer-prompt.ts`),
an injectable `ArticleWriter` returning strict JSON, HTML sanitisation, the SEO package, provenance,
editorial QA (`editorial-qa.ts`) and publication gates (`publication-gates.ts`). It then
materialises a draft `ContentProject`/`ContentVersion`. The `ArticleGeneration` row records every
artifact, but nothing tracks the run as a job, so it cannot be retried, cancelled or seen in
Operations.

## Decision

`src/studio/production/pipeline.ts` exposes one entry point, `startProduction(request)`. The
request is `{kind:'plan_item', planItemId} | {kind:'cluster', clusterId} | {kind:'manual', title, brief, siteId}`.
Every request becomes a durable `ProductionJob` with its own `Operation`, and runs the same ordered
stage registry (`production/stages.ts`):

| stage | shared or specialised |
|---|---|
| `prepare` | specialised: load the cluster ledger, entities and enrichments, or the plan item and its project shell, or the manual brief |
| `duplicates` | shared: `decideCreateUpdateOrSkip`, with the job's own project excluded |
| `evidence` | shared: `buildFactSafetyReport` over the ledger. A cluster uses its StoryFacts. A plan item turns its validated `sourceEvidence` into single-source facts that must be attributed |
| `brief` | specialised builder that produces one `EditorialBrief` type: classifier, site value and `buildStoryBrief` for a cluster; field mapping (outline, keywords, audience, questions, FAQ, `metadata.generation`) for a plan item |
| `write` | shared: `buildWriterPrompt` + `getArticleWriter()` + `parseWriterOutput` + `sanitizeEditorialHtml` |
| `seo` | shared: `buildSeoPackage` |
| `qa` | shared: `runEditorialQa` and `runVersionQaV2` on the same draft |
| `gates` | shared: `evaluatePublicationGates` against the site's existing `AutomationPolicy` |
| `materialize` | shared: one project and one version (it reuses the plan item project or the cluster's update target), provenance, `ArticleGeneration` mirror, audit, hero image request |

### Writer choice

The Editorial Engine writer is the stronger of the two writers, so both paths now use it. It
returns structured JSON (title, H1, excerpt, SEO fields, claims mapped to fact keys) instead of free
text. It is grounded in a fact ledger that has usage licenses, and it carries originality and
prompt-injection rules. Its output is sanitised against an allowlist, and tests can inject a fake
writer through `setArticleWriterFactory`. The queue writer emits unstructured text that `toHtml`
guesses into paragraphs, and it cannot be checked claim by claim. Plan item guidance (outline,
questions, FAQ candidates, CTA, audience) goes into the prompt as an untrusted
`editorial-plan` block.

### Job semantics

- Status values are `queued | running | needs_review | ready | failed | cancelled`. A job records
  the current `stage`, `attempts`, `error` and `errorCode`. Stage outputs are stored in
  `artifacts`, so a retry resumes from the failed stage. A gate rejection resumes from `write`.
- Idempotency: `idempotencyKey` is unique (`plan_item:<id>`, `cluster:<id>:<siteId>`, `manual:<hash>`).
  Starting a job again returns the active job. A failed or cancelled job is resumed rather than
  duplicated. For a cluster, a finished job's key is archived, so the next run becomes an
  `update_existing` of the same project. Materialisation reuses `job.projectId`, which is how ENG-02
  holds: a retry never creates a second project or publication.
- Cancel is allowed only while `write` has not completed. After that, the run stops at the next
  stage boundary only if `cancelRequestedAt` was set before `write` completed.
- Review: `approve` sets the job to `ready`. Publication still goes through the existing
  publish/schedule flows. Only a cluster job auto-publishes, and only when the gates return
  `auto_publish` and `policy.autoPublish` is true. This matches the earlier engine behaviour, and
  policies are not modified.
- Plan item status follows the job: `generating` while it runs, then `review_required` (needs
  review), `content_ready` (ready), or back to `approved` with `contentGenerationStatus=failed` or
  `cancelled`. The enum has no `failed` value.

## Consequences

- Plan item content now passes fact safety, duplicate detection, provenance and editorial QA. The
  writer must attribute or omit claims it has no evidence for, so some evergreen drafts that used
  to pass will now land in `needs_review`. This is intended.
- Social-channel plan items (`x`, `instagram`) still use the legacy queue generator through
  `startProductionForPlanItem`, because the article writer cannot produce social packs. This is a
  known gap.
- The image worker and `syncImageResultToStudio` still run after `materialize`. They re-run
  `runVersionQaV2` once the hero image exists.
