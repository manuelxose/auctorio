-- The (tenant_id, site_id, canonical_url) unique index does not constrain rows with NULL site_id
-- (legacy web-discovery rows and copilot propose_source rows), so those could be duplicated per domain.
-- Partial unique index over (tenant_id, domain) for site_id IS NULL rows. Created only when no
-- duplicates exist, so the migration can never fail on real data; if duplicates exist it is skipped
-- (NOTICE) and an operator must dedupe those rows and create the index by hand.
-- Prisma cannot express partial indexes, so this index lives only in SQL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "source_recommendations" WHERE "site_id" IS NULL
    GROUP BY "tenant_id", "domain" HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'source_recommendations has duplicate (tenant_id, domain) rows with NULL site_id; skipping unique index creation';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "source_recommendations_tenant_id_domain_null_site_key"
      ON "source_recommendations"("tenant_id", "domain") WHERE "site_id" IS NULL;
  END IF;
END $$;
