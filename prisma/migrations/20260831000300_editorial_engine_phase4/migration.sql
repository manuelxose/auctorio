-- Phase 4: Editorial engine — evidence-grounded original article generation.
-- Editorial brief, fact licenses, writer prompt, parsed article, SEO package,
-- QA report, publication decision and provenance per generation run.

-- Site-level unique value configuration (per site/domain).
ALTER TABLE "sites" ADD COLUMN "site_value_config" JSONB;

-- Automation policy publication gates (autoPublish quality requirements).
ALTER TABLE "automation_policies" ADD COLUMN "qa_gates" JSONB;

-- Central editorial engine record: one row per generation run.
CREATE TABLE "article_generations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID,
    "cluster_id" UUID,
    "project_id" UUID,
    "version_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'briefing',
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "decision_reason" TEXT,
    "article_type" TEXT,
    "search_intent" TEXT,
    "brief" JSONB,
    "fact_licenses" JSONB,
    "writer_prompt" TEXT,
    "article_output" TEXT,
    "parsed_article" JSONB,
    "seo_package" JSONB,
    "qa_report" JSONB,
    "publication_decision" JSONB,
    "provenance" JSONB,
    "update_delta" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "cost_usd" DOUBLE PRECISION,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_generations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "article_generations_tenant_id_cluster_id_created_at_idx" ON "article_generations"("tenant_id", "cluster_id", "created_at");
CREATE INDEX "article_generations_tenant_id_project_id_idx" ON "article_generations"("tenant_id", "project_id");
CREATE INDEX "article_generations_tenant_id_status_created_at_idx" ON "article_generations"("tenant_id", "status", "created_at");

ALTER TABLE "article_generations" ADD CONSTRAINT "article_generations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "article_generations" ADD CONSTRAINT "article_generations_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "article_generations" ADD CONSTRAINT "article_generations_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "story_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "article_generations" ADD CONSTRAINT "article_generations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "content_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "article_generations" ADD CONSTRAINT "article_generations_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "content_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
