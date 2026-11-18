-- M6: PublicationJob is gone; website delivery lives on publications + publication_attempts (M3b).
-- Destructive: take a database backup before deploying.
-- Keep the remote ids of legacy deliveries so a later publish updates the post instead of duplicating it.

-- 1) Linked publications: copy the remote id they still lack.
UPDATE "publications" AS p
SET "external_id" = j."external_id",
    "external_url" = COALESCE(p."external_url", j."external_url")
FROM "publication_jobs" AS j
WHERE p."publication_job_id" = j."id"::text
  AND p."external_id" IS NULL
  AND j."external_id" IS NOT NULL
  AND j."external_id" NOT LIKE 'dryrun-%';

-- 2) Unlinked legacy deliveries (before STUDIO-08): keep the latest one per project and site
--    when no website publication of that project already carries a remote id.
INSERT INTO "publications" (
  "id", "tenant_id", "project_id", "version_id", "channel", "site_id", "publication_job_id",
  "status", "published_at", "external_id", "external_url", "created_at", "updated_at"
)
SELECT DISTINCT ON (j."tenant_id", j."site_id", j."project_id")
  gen_random_uuid(), j."tenant_id", j."project_id", j."version_id", 'website'::"PublicationChannel", j."site_id", j."id"::text,
  CASE WHEN j."status" = 'published' THEN 'published'::"PublicationState" ELSE 'ready'::"PublicationState" END,
  j."published_at", j."external_id", j."external_url", j."created_at", NOW()
FROM "publication_jobs" AS j
WHERE j."status" IN ('published', 'draft_synced')
  AND j."external_id" IS NOT NULL
  AND j."external_id" NOT LIKE 'dryrun-%'
  AND NOT EXISTS (SELECT 1 FROM "publications" p WHERE p."publication_job_id" = j."id"::text)
  AND NOT EXISTS (
    SELECT 1 FROM "publications" p
    WHERE p."tenant_id" = j."tenant_id" AND p."project_id" = j."project_id" AND p."site_id" = j."site_id"
      AND p."channel" = 'website' AND p."external_id" IS NOT NULL
  )
ORDER BY j."tenant_id", j."site_id", j."project_id", j."created_at" DESC;

-- 3) Drop the table (its foreign keys go with it) and its enums.
DROP TABLE "publication_jobs";
DROP TYPE "PublicationStatus";
DROP TYPE "PublicationAction";
