-- SEO-V2-06: operations center. Additive: three tables and one nullable column.
ALTER TABLE "seo_provider_states" ADD COLUMN "balance" JSONB;

CREATE TABLE "seo_usage_daily" (
    "day" DATE NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_key" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    CONSTRAINT "seo_usage_daily_pkey" PRIMARY KEY ("day", "tenant_id", "site_key", "provider_id", "operation", "metric")
);
CREATE INDEX "seo_usage_daily_metric_day_idx" ON "seo_usage_daily"("metric", "day");

CREATE TABLE "seo_license_records" (
    "id" UUID NOT NULL,
    "provider_id" TEXT NOT NULL,
    "commercial_use" TEXT NOT NULL,
    "storage" TEXT NOT NULL,
    "cross_tenant_sharing" TEXT NOT NULL,
    "document_url" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "valid_until" TIMESTAMP(3),
    "created_by_user_id" UUID NOT NULL,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "seo_license_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "seo_license_records_provider_id_status_idx" ON "seo_license_records"("provider_id", "status");

CREATE TABLE "seo_research_holds" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "scope_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "seo_research_holds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "seo_research_holds_scope_scope_id_key" ON "seo_research_holds"("scope", "scope_id");
