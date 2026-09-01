-- Phase 2: Production source registry, source packs, enrichment providers,
-- conditional-fetch state and operational diagnostics.

-- ContentSource registry fields
ALTER TABLE "content_sources" ADD COLUMN "pack_key" TEXT,
    ADD COLUMN "verified_at" TIMESTAMP(3),
    ADD COLUMN "verification_status" TEXT,
    ADD COLUMN "discovery_method" TEXT,
    ADD COLUMN "restrictions_note" TEXT,
    ADD COLUMN "archived_at" TIMESTAMP(3),
    ADD COLUMN "last_error" TEXT,
    ADD COLUMN "last_error_at" TIMESTAMP(3),
    ADD COLUMN "last_etag" TEXT,
    ADD COLUMN "last_modified_header" TEXT,
    ADD COLUMN "last_http_status" INTEGER,
    ADD COLUMN "not_modified_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "content_sources_tenant_id_pack_key_idx" ON "content_sources"("tenant_id", "pack_key");

-- SourceHealth diagnostics
ALTER TABLE "source_health" ADD COLUMN "not_modified_fetches" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "last_error" TEXT,
    ADD COLUMN "last_error_at" TIMESTAMP(3);

-- Source packs
CREATE TABLE "source_packs" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "language" TEXT,
    "country" TEXT,
    "source_count" INTEGER NOT NULL DEFAULT 0,
    "optional" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_packs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "source_packs_key_key" ON "source_packs"("key");

-- Source pack imports (audit trail of pack → DB bootstrap)
CREATE TABLE "source_pack_imports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "pack_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_source_ids" JSONB,
    "log" JSONB,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imported_by_user_id" UUID,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "source_pack_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "source_pack_imports_tenant_id_pack_key_idx" ON "source_pack_imports"("tenant_id", "pack_key");

-- Enrichment providers (structured-data APIs, independent of editorial sources)
CREATE TABLE "enrichment_providers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider_type" TEXT NOT NULL,
    "adapter" TEXT NOT NULL DEFAULT 'api',
    "base_url" TEXT,
    "endpoint" TEXT,
    "credentials_ref" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "country" TEXT,
    "refresh_interval_minutes" INTEGER NOT NULL DEFAULT 60,
    "rate_limit_policy" JSONB,
    "extraction_policy" JSONB,
    "configuration" JSONB,
    "last_fetched_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "last_error_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "verification_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrichment_providers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "enrichment_providers_tenant_id_key_key" ON "enrichment_providers"("tenant_id", "key");
CREATE INDEX "enrichment_providers_tenant_id_enabled_idx" ON "enrichment_providers"("tenant_id", "enabled");

ALTER TABLE "source_pack_imports" ADD CONSTRAINT "source_pack_imports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enrichment_providers" ADD CONSTRAINT "enrichment_providers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
