-- Content Intelligence Platform — Phase 1
-- Source metadata, normalized dedup signals, story-cluster intelligence,
-- operational source health and discovery-run tracing.

-- ── New adapter types
ALTER TYPE "ContentSourceType" ADD VALUE IF NOT EXISTS 'graphql';
ALTER TYPE "ContentSourceType" ADD VALUE IF NOT EXISTS 'webhook';

-- ── ContentSource: richer source metadata + per-source policies
ALTER TABLE "content_sources" ADD COLUMN "domain" TEXT;
ALTER TABLE "content_sources" ADD COLUMN "endpoint" TEXT;
ALTER TABLE "content_sources" ADD COLUMN "authority_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
ALTER TABLE "content_sources" ADD COLUMN "freshness_weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE "content_sources" ADD COLUMN "timezone" TEXT;
ALTER TABLE "content_sources" ADD COLUMN "credentials_ref" TEXT;
ALTER TABLE "content_sources" ADD COLUMN "rate_limit_policy" JSONB;
ALTER TABLE "content_sources" ADD COLUMN "robots_policy" JSONB;
ALTER TABLE "content_sources" ADD COLUMN "extraction_policy" JSONB;
ALTER TABLE "content_sources" ADD COLUMN "enrichment_policy" JSONB;
ALTER TABLE "content_sources" ADD COLUMN "copyright_policy" JSONB;

-- ── SourceItem: normalized-model signals + extraction/attribution metadata
ALTER TABLE "source_items" ADD COLUMN "discovery_run_id" UUID;
ALTER TABLE "source_items" ADD COLUMN "canonical_url_hash" TEXT;
ALTER TABLE "source_items" ADD COLUMN "normalized_title_hash" TEXT;
ALTER TABLE "source_items" ADD COLUMN "modified_at" TIMESTAMP(3);
ALTER TABLE "source_items" ADD COLUMN "extraction_status" TEXT NOT NULL DEFAULT 'discovered';
ALTER TABLE "source_items" ADD COLUMN "confidence" DOUBLE PRECISION;
ALTER TABLE "source_items" ADD COLUMN "attribution" JSONB;

-- The previous global content-hash uniqueness rejected cross-publisher
-- syndication (same story, same text, different source). Deduplication is now
-- code-driven and time-windowed; keep a plain index for lookups.
DROP INDEX "source_items_tenant_id_content_hash_key";
CREATE INDEX "source_items_tenant_id_content_hash_idx" ON "source_items"("tenant_id", "content_hash");
CREATE INDEX "source_items_tenant_id_canonical_url_hash_idx" ON "source_items"("tenant_id", "canonical_url_hash");
CREATE INDEX "source_items_tenant_id_normalized_title_hash_idx" ON "source_items"("tenant_id", "normalized_title_hash");
CREATE INDEX "source_items_tenant_id_published_at_idx" ON "source_items"("tenant_id", "published_at");

-- ── StoryCluster: event-level intelligence signals
ALTER TABLE "story_clusters" ADD COLUMN "primary_source_id" UUID;
ALTER TABLE "story_clusters" ADD COLUMN "entity_candidates" JSONB;
ALTER TABLE "story_clusters" ADD COLUMN "categories" JSONB;
ALTER TABLE "story_clusters" ADD COLUMN "languages" JSONB;
ALTER TABLE "story_clusters" ADD COLUMN "confidence" DOUBLE PRECISION;
ALTER TABLE "story_clusters" ADD COLUMN "freshness_score" DOUBLE PRECISION;
ALTER TABLE "story_clusters" ADD COLUMN "authority_score" DOUBLE PRECISION;
ALTER TABLE "story_clusters" ADD COLUMN "relevance_score" DOUBLE PRECISION;
ALTER TABLE "story_clusters" ADD COLUMN "editorial_value" DOUBLE PRECISION;
ALTER TABLE "story_clusters" ADD COLUMN "verification_state" TEXT NOT NULL DEFAULT 'unverified';

ALTER TABLE "story_clusters" ADD CONSTRAINT "story_clusters_primary_source_id_fkey" FOREIGN KEY ("primary_source_id") REFERENCES "content_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── SourceHealth: 1:1 operational health per source
CREATE TABLE "source_health" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "health_status" TEXT NOT NULL DEFAULT 'unknown',
    "last_http_status" INTEGER,
    "http_status_counts" JSONB,
    "fetch_latency_ms" INTEGER,
    "total_fetches" INTEGER NOT NULL DEFAULT 0,
    "successful_fetches" INTEGER NOT NULL DEFAULT 0,
    "failed_fetches" INTEGER NOT NULL DEFAULT 0,
    "parse_failures" INTEGER NOT NULL DEFAULT 0,
    "empty_feeds" INTEGER NOT NULL DEFAULT 0,
    "items_discovered" INTEGER NOT NULL DEFAULT 0,
    "duplicate_rate" DOUBLE PRECISION,
    "last_new_item_at" TIMESTAMP(3),
    "rate_limit_events" INTEGER NOT NULL DEFAULT 0,
    "circuit_state" TEXT NOT NULL DEFAULT 'closed',
    "circuit_opened_at" TIMESTAMP(3),
    "last_health_check_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_health_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "source_health_source_id_key" ON "source_health"("source_id");
CREATE INDEX "source_health_tenant_id_health_status_idx" ON "source_health"("tenant_id", "health_status");

ALTER TABLE "source_health" ADD CONSTRAINT "source_health_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_health" ADD CONSTRAINT "source_health_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "content_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── DiscoveryRun: run → source → adapter → items tracing + metrics
CREATE TABLE "discovery_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "source_id" UUID,
    "run_key" TEXT NOT NULL,
    "adapter_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "items_found" INTEGER NOT NULL DEFAULT 0,
    "items_created" INTEGER NOT NULL DEFAULT 0,
    "items_duplicated" INTEGER NOT NULL DEFAULT 0,
    "clusters_created" INTEGER NOT NULL DEFAULT 0,
    "parse_errors" INTEGER NOT NULL DEFAULT 0,
    "source_failures" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "metrics" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "discovery_runs_tenant_id_started_at_idx" ON "discovery_runs"("tenant_id", "started_at");
CREATE INDEX "discovery_runs_run_key_idx" ON "discovery_runs"("run_key");

ALTER TABLE "discovery_runs" ADD CONSTRAINT "discovery_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "discovery_runs" ADD CONSTRAINT "discovery_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "content_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "source_items" ADD CONSTRAINT "source_items_discovery_run_id_fkey" FOREIGN KEY ("discovery_run_id") REFERENCES "discovery_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
