-- AlterTable
ALTER TABLE "content_opportunities" ADD COLUMN     "action" TEXT,
ADD COLUMN     "analyzed_at" TIMESTAMP(3),
ADD COLUMN     "confidence" INTEGER,
ADD COLUMN     "decided_at" TIMESTAMP(3),
ADD COLUMN     "explanation" JSONB,
ADD COLUMN     "priority" DOUBLE PRECISION,
ADD COLUMN     "query" TEXT,
ADD COLUMN     "score" INTEGER,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'competitor';

-- CreateTable
CREATE TABLE "search_console_connections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "property" TEXT,
    "permission_level" TEXT,
    "refresh_token_ciphertext" TEXT,
    "status" TEXT NOT NULL,
    "synced_through" DATE,
    "synced_from" DATE,
    "backfill_complete" BOOLEAN NOT NULL DEFAULT false,
    "last_sync_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_error" TEXT,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "next_sync_at" TIMESTAMP(3),
    "lease_until" TIMESTAMP(3),
    "connected_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_console_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_performance" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "dataset" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "page" TEXT NOT NULL DEFAULT '',
    "query" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "device" TEXT NOT NULL DEFAULT '',
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "position_sum" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "search_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_index_status" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "verdict" TEXT,
    "coverage_state" TEXT,
    "indexing_state" TEXT,
    "robots_state" TEXT,
    "fetch_state" TEXT,
    "google_canonical" TEXT,
    "user_canonical" TEXT,
    "last_crawl_at" TIMESTAMP(3),
    "inspected_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_index_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_seo_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "profile" TEXT NOT NULL,
    "weights" JSONB,
    "priority_topics" JSONB,
    "holdout_percent" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_seo_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_actions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "url" TEXT,
    "query" TEXT,
    "plan_item_id" UUID,
    "publication_id" UUID,
    "acted_at" TIMESTAMP(3) NOT NULL,
    "baseline" JSONB,
    "evaluations" JSONB,
    "seo_cost_usd" DOUBLE PRECISION,
    "content_cost_usd" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "search_console_connections_site_id_key" ON "search_console_connections"("site_id");

-- CreateIndex
CREATE INDEX "search_console_connections_status_next_sync_at_idx" ON "search_console_connections"("status", "next_sync_at");

-- CreateIndex
CREATE INDEX "search_performance_tenant_id_site_id_dataset_date_idx" ON "search_performance"("tenant_id", "site_id", "dataset", "date");

-- CreateIndex
CREATE INDEX "search_performance_site_id_idx" ON "search_performance"("site_id");

-- CreateIndex
CREATE INDEX "search_index_status_tenant_id_site_id_inspected_at_idx" ON "search_index_status"("tenant_id", "site_id", "inspected_at");

-- CreateIndex
CREATE UNIQUE INDEX "search_index_status_site_id_url_key" ON "search_index_status"("site_id", "url");

-- CreateIndex
CREATE UNIQUE INDEX "site_seo_profiles_site_id_key" ON "site_seo_profiles"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "seo_actions_opportunity_id_key" ON "seo_actions"("opportunity_id");

-- CreateIndex
CREATE INDEX "seo_actions_tenant_id_site_id_acted_at_idx" ON "seo_actions"("tenant_id", "site_id", "acted_at");

-- CreateIndex
CREATE INDEX "content_opportunities_tenant_id_site_id_source_idx" ON "content_opportunities"("tenant_id", "site_id", "source");

-- AddForeignKey
ALTER TABLE "search_console_connections" ADD CONSTRAINT "search_console_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_console_connections" ADD CONSTRAINT "search_console_connections_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_performance" ADD CONSTRAINT "search_performance_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_performance" ADD CONSTRAINT "search_performance_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_index_status" ADD CONSTRAINT "search_index_status_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_index_status" ADD CONSTRAINT "search_index_status_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_seo_profiles" ADD CONSTRAINT "site_seo_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_seo_profiles" ADD CONSTRAINT "site_seo_profiles_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_actions" ADD CONSTRAINT "seo_actions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_actions" ADD CONSTRAINT "seo_actions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_actions" ADD CONSTRAINT "seo_actions_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "content_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Decisions people already made are not reopened by the engine.
UPDATE "content_opportunities" SET "decided_at" = "updated_at" WHERE "status" <> 'open';
