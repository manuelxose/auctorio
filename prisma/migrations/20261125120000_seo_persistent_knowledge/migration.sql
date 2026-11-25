-- AlterTable
ALTER TABLE "content_opportunities" ADD COLUMN     "market" TEXT,
ADD COLUMN     "research_run_id" UUID,
ADD COLUMN     "reserved_by" UUID,
ADD COLUMN     "reserved_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "seo_spend_reservations" ADD COLUMN     "run_id" UUID;

-- CreateTable
CREATE TABLE "seo_keyword_metrics" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "volume" INTEGER,
    "difficulty" DOUBLE PRECISION,
    "cpc" DOUBLE PRECISION,
    "intent" TEXT,
    "fields" JSONB NOT NULL,
    "quality" INTEGER NOT NULL,
    "storage" TEXT NOT NULL,
    "sharing" TEXT NOT NULL,
    "reservation_id" UUID,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3) NOT NULL,
    "retain_until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_keyword_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_keywords" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "market" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "keyword_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "reason" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER,
    "cluster" TEXT,
    "opportunity_id" UUID,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_keyword_discoveries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_keyword_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "competitor_id" UUID,
    "position" INTEGER,
    "url" TEXT,
    "provider_id" TEXT NOT NULL,
    "run_id" UUID,
    "discovered_at" TIMESTAMP(3) NOT NULL,
    "retain_until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_keyword_discoveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_research_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "derived" JSONB,
    "derived_at" TIMESTAMP(3),
    "corrections" JSONB,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_user_id" UUID,
    "policy" JSONB,
    "next_check_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_research_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_research_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "trigger_key" TEXT,
    "reason" JSONB NOT NULL,
    "active_key" UUID,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "policy" JSONB NOT NULL,
    "max_usd" DOUBLE PRECISION NOT NULL,
    "estimated_usd" DOUBLE PRECISION,
    "summary" JSONB,
    "error" TEXT,
    "lease_id" UUID,
    "lease_until" TIMESTAMP(3),
    "next_at" TIMESTAMP(3),
    "requested_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_research_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_research_tasks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "market" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "focus" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_usd" DOUBLE PRECISION,
    "billed_usd" DOUBLE PRECISION,
    "result" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "seo_research_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seo_keyword_metrics_tenant_id_country_language_keyword_idx" ON "seo_keyword_metrics"("tenant_id", "country", "language", "keyword");

-- CreateIndex
CREATE INDEX "seo_keyword_metrics_country_language_keyword_idx" ON "seo_keyword_metrics"("country", "language", "keyword");

-- CreateIndex
CREATE INDEX "seo_keyword_metrics_retain_until_idx" ON "seo_keyword_metrics"("retain_until");

-- CreateIndex
CREATE INDEX "site_keywords_tenant_id_site_id_status_idx" ON "site_keywords"("tenant_id", "site_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "site_keywords_site_id_market_keyword_key_key" ON "site_keywords"("site_id", "market", "keyword_key");

-- CreateIndex
CREATE INDEX "site_keyword_discoveries_tenant_id_competitor_id_idx" ON "site_keyword_discoveries"("tenant_id", "competitor_id");

-- CreateIndex
CREATE INDEX "site_keyword_discoveries_retain_until_idx" ON "site_keyword_discoveries"("retain_until");

-- CreateIndex
CREATE UNIQUE INDEX "site_keyword_discoveries_site_keyword_id_kind_value_key" ON "site_keyword_discoveries"("site_keyword_id", "kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "site_research_profiles_site_id_key" ON "site_research_profiles"("site_id");

-- CreateIndex
CREATE INDEX "site_research_profiles_next_check_at_idx" ON "site_research_profiles"("next_check_at");

-- CreateIndex
CREATE UNIQUE INDEX "seo_research_runs_active_key_key" ON "seo_research_runs"("active_key");

-- CreateIndex
CREATE INDEX "seo_research_runs_tenant_id_site_id_created_at_idx" ON "seo_research_runs"("tenant_id", "site_id", "created_at");

-- CreateIndex
CREATE INDEX "seo_research_runs_status_next_at_idx" ON "seo_research_runs"("status", "next_at");

-- CreateIndex
CREATE UNIQUE INDEX "seo_research_runs_site_id_trigger_key_key" ON "seo_research_runs"("site_id", "trigger_key");

-- CreateIndex
CREATE INDEX "seo_research_tasks_tenant_id_site_id_kind_status_idx" ON "seo_research_tasks"("tenant_id", "site_id", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seo_research_tasks_run_id_kind_subject_market_key" ON "seo_research_tasks"("run_id", "kind", "subject", "market");

-- CreateIndex
CREATE INDEX "seo_spend_reservations_run_id_idx" ON "seo_spend_reservations"("run_id");

-- AddForeignKey
ALTER TABLE "seo_keyword_metrics" ADD CONSTRAINT "seo_keyword_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_keywords" ADD CONSTRAINT "site_keywords_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_keywords" ADD CONSTRAINT "site_keywords_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_keyword_discoveries" ADD CONSTRAINT "site_keyword_discoveries_site_keyword_id_fkey" FOREIGN KEY ("site_keyword_id") REFERENCES "site_keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_research_profiles" ADD CONSTRAINT "site_research_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_research_profiles" ADD CONSTRAINT "site_research_profiles_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_research_runs" ADD CONSTRAINT "seo_research_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_research_runs" ADD CONSTRAINT "seo_research_runs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_research_tasks" ADD CONSTRAINT "seo_research_tasks_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "seo_research_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
