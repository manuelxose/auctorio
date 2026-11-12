-- DropIndex
DROP INDEX "source_recommendations_tenant_id_domain_key";

-- AlterTable
ALTER TABLE "source_recommendations" ADD COLUMN     "assessment_reason" TEXT,
ADD COLUMN     "canonical_url" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "discovery_method" TEXT,
ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "expected_freshness" TEXT,
ADD COLUMN     "geography" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "last_checked_at" TIMESTAMP(3),
ADD COLUMN     "limitations" JSONB,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "relationship" TEXT,
ADD COLUMN     "relevance" TEXT,
ADD COLUMN     "site_id" UUID,
ADD COLUMN     "topics" JSONB,
ADD COLUMN     "trust_level" TEXT,
ADD COLUMN     "type" TEXT,
ADD COLUMN     "url" TEXT,
ADD COLUMN     "verification_status" TEXT;

-- CreateTable
CREATE TABLE "competitors" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "verification" TEXT NOT NULL DEFAULT 'speculative',
    "evidence" JSONB,
    "overlap_topics" JSONB,
    "overlap_score" DOUBLE PRECISION,
    "notes" TEXT,
    "sitemap_url" TEXT,
    "feed_url" TEXT,
    "last_checked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_coverage_snapshots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "competitor_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "topic" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_coverage_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_opportunities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "competitor_id" UUID,
    "kind" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidence" JSONB,
    "related_site_urls" JSONB,
    "target_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "plan_item_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "competitors_tenant_id_site_id_status_idx" ON "competitors"("tenant_id", "site_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_site_id_domain_key" ON "competitors"("site_id", "domain");

-- CreateIndex
CREATE INDEX "competitor_coverage_snapshots_site_id_topic_idx" ON "competitor_coverage_snapshots"("site_id", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_coverage_snapshots_competitor_id_url_key" ON "competitor_coverage_snapshots"("competitor_id", "url");

-- CreateIndex
CREATE INDEX "content_opportunities_tenant_id_site_id_status_idx" ON "content_opportunities"("tenant_id", "site_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "content_opportunities_site_id_dedupe_key_key" ON "content_opportunities"("site_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "source_recommendations_tenant_id_domain_idx" ON "source_recommendations"("tenant_id", "domain");

-- CreateIndex
CREATE INDEX "source_recommendations_tenant_id_site_id_status_idx" ON "source_recommendations"("tenant_id", "site_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "source_recommendations_tenant_id_site_id_canonical_url_key" ON "source_recommendations"("tenant_id", "site_id", "canonical_url");

-- AddForeignKey
ALTER TABLE "source_recommendations" ADD CONSTRAINT "source_recommendations_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_coverage_snapshots" ADD CONSTRAINT "competitor_coverage_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_coverage_snapshots" ADD CONSTRAINT "competitor_coverage_snapshots_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_coverage_snapshots" ADD CONSTRAINT "competitor_coverage_snapshots_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_opportunities" ADD CONSTRAINT "content_opportunities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_opportunities" ADD CONSTRAINT "content_opportunities_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_opportunities" ADD CONSTRAINT "content_opportunities_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

