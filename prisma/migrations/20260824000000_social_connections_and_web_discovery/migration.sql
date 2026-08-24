-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StoryClusterStatus" ADD VALUE 'developing';
ALTER TYPE "StoryClusterStatus" ADD VALUE 'updated';
ALTER TYPE "StoryClusterStatus" ADD VALUE 'superseded';

-- AlterTable
ALTER TABLE "content_sources" ADD COLUMN     "last_discovery_at" TIMESTAMP(3),
ADD COLUMN     "quality_score" DOUBLE PRECISION,
ADD COLUMN     "quality_tier" TEXT;

-- AlterTable
ALTER TABLE "publishing_accounts" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "connected_at" TIMESTAMP(3),
ADD COLUMN     "connection_metadata" JSONB,
ADD COLUMN     "connection_status" TEXT,
ADD COLUMN     "credentials_ciphertext" TEXT,
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN     "provider_account_id" TEXT,
ADD COLUMN     "provider_profile_id" TEXT,
ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "story_clusters" ADD COLUMN     "last_update_at" TIMESTAMP(3),
ADD COLUMN     "update_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "social_connection_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "studio_user_id" UUID,
    "site_id" UUID,
    "platform" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "state_hash" TEXT NOT NULL,
    "redirect_uri" TEXT,
    "provider_link" TEXT,
    "provider_token" TEXT,
    "metadata" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_connection_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_discovery_queries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID,
    "trigger" TEXT NOT NULL DEFAULT 'scheduled',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "category" TEXT,
    "query_text" TEXT NOT NULL,
    "freshness_hours" INTEGER NOT NULL DEFAULT 24,
    "language" TEXT,
    "country" TEXT,
    "entities" JSONB,
    "topics" JSONB,
    "preferred_domains" JSONB,
    "excluded_domains" JSONB,
    "reasoning_summary" TEXT,
    "provider" TEXT,
    "results_json" JSONB,
    "error" TEXT,
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web_discovery_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovered_domains" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discovery_count" INTEGER NOT NULL DEFAULT 0,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "quality_score" DOUBLE PRECISION,
    "tier" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovered_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_quality_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "source_id" UUID,
    "domain" TEXT NOT NULL,
    "dimensions_json" JSONB,
    "score" DOUBLE PRECISION NOT NULL,
    "tier" TEXT NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_quality_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_recommendations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "source_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'open',
    "score" DOUBLE PRECISION NOT NULL,
    "searches_count" INTEGER NOT NULL DEFAULT 0,
    "reason_summary" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_retrievals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "source_item_id" UUID,
    "source_id" UUID,
    "url" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "title" TEXT,
    "publisher" TEXT,
    "published_at" TIMESTAMP(3),
    "article_text" TEXT,
    "entities" JSONB,
    "claims" JSONB,
    "provider" TEXT,
    "tokens_in" INTEGER NOT NULL DEFAULT 0,
    "tokens_out" INTEGER NOT NULL DEFAULT 0,
    "retrieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_retrievals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_usage_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "queries" INTEGER NOT NULL DEFAULT 0,
    "urls_scraped" INTEGER NOT NULL DEFAULT 0,
    "tokens_in" INTEGER NOT NULL DEFAULT 0,
    "tokens_out" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost_usd" DECIMAL(12,6) DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT NOT NULL DEFAULT 'recommend',
    "frequency_minutes" INTEGER NOT NULL DEFAULT 30,
    "languages" JSONB,
    "regions" JSONB,
    "max_searches_per_day" INTEGER NOT NULL DEFAULT 100,
    "max_scrapes_per_day" INTEGER NOT NULL DEFAULT 250,
    "max_discovery_cost_per_day" DECIMAL(12,6) DEFAULT 5,
    "prefer_primary_sources" BOOLEAN NOT NULL DEFAULT true,
    "require_two_sources" BOOLEAN NOT NULL DEFAULT true,
    "avoid_low_authority" BOOLEAN NOT NULL DEFAULT true,
    "detect_developing_stories" BOOLEAN NOT NULL DEFAULT true,
    "auto_enable_sources" BOOLEAN NOT NULL DEFAULT false,
    "min_recommendation_score" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "updated_by_studio_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovery_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_domains" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "social_connection_sessions_state_hash_key" ON "social_connection_sessions"("state_hash");

-- CreateIndex
CREATE INDEX "social_connection_sessions_tenant_id_platform_consumed_at_idx" ON "social_connection_sessions"("tenant_id", "platform", "consumed_at");

-- CreateIndex
CREATE INDEX "social_connection_sessions_expires_at_idx" ON "social_connection_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "web_discovery_queries_tenant_id_status_created_at_idx" ON "web_discovery_queries"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "web_discovery_queries_tenant_id_site_id_created_at_idx" ON "web_discovery_queries"("tenant_id", "site_id", "created_at");

-- CreateIndex
CREATE INDEX "discovered_domains_tenant_id_blocked_quality_score_idx" ON "discovered_domains"("tenant_id", "blocked", "quality_score");

-- CreateIndex
CREATE UNIQUE INDEX "discovered_domains_tenant_id_domain_key" ON "discovered_domains"("tenant_id", "domain");

-- CreateIndex
CREATE INDEX "source_quality_profiles_tenant_id_source_id_idx" ON "source_quality_profiles"("tenant_id", "source_id");

-- CreateIndex
CREATE INDEX "source_quality_profiles_tenant_id_domain_evaluated_at_idx" ON "source_quality_profiles"("tenant_id", "domain", "evaluated_at");

-- CreateIndex
CREATE INDEX "source_recommendations_tenant_id_status_score_idx" ON "source_recommendations"("tenant_id", "status", "score");

-- CreateIndex
CREATE UNIQUE INDEX "source_recommendations_tenant_id_domain_key" ON "source_recommendations"("tenant_id", "domain");

-- CreateIndex
CREATE INDEX "web_retrievals_tenant_id_source_item_id_idx" ON "web_retrievals"("tenant_id", "source_item_id");

-- CreateIndex
CREATE INDEX "web_retrievals_tenant_id_source_id_idx" ON "web_retrievals"("tenant_id", "source_id");

-- CreateIndex
CREATE INDEX "web_retrievals_tenant_id_content_hash_idx" ON "web_retrievals"("tenant_id", "content_hash");

-- CreateIndex
CREATE INDEX "web_usage_records_tenant_id_provider_operation_created_at_idx" ON "web_usage_records"("tenant_id", "provider", "operation", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "discovery_configs_tenant_id_site_id_key" ON "discovery_configs"("tenant_id", "site_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_domains_tenant_id_domain_key" ON "blocked_domains"("tenant_id", "domain");

-- CreateIndex
CREATE INDEX "publishing_accounts_tenant_id_provider_idx" ON "publishing_accounts"("tenant_id", "provider");

-- AddForeignKey
ALTER TABLE "social_connection_sessions" ADD CONSTRAINT "social_connection_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_discovery_queries" ADD CONSTRAINT "web_discovery_queries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovered_domains" ADD CONSTRAINT "discovered_domains_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_quality_profiles" ADD CONSTRAINT "source_quality_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_recommendations" ADD CONSTRAINT "source_recommendations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_retrievals" ADD CONSTRAINT "web_retrievals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_retrievals" ADD CONSTRAINT "web_retrievals_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "source_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_usage_records" ADD CONSTRAINT "web_usage_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_configs" ADD CONSTRAINT "discovery_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_domains" ADD CONSTRAINT "blocked_domains_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

