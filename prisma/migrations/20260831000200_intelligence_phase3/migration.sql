-- Phase 3: Story intelligence — entities, fact ledger, provider cache,
-- provider enrichments, site editorial profiles, mute rules, intelligence
-- settings, and cluster/run observability columns.

-- StoryCluster intelligence columns
ALTER TABLE "story_clusters" ADD COLUMN "verification_detail" JSONB,
    ADD COLUMN "source_diversity" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "diversity_detail" JSONB,
    ADD COLUMN "candidate_score" DOUBLE PRECISION,
    ADD COLUMN "score_components" JSONB,
    ADD COLUMN "site_fit_score" DOUBLE PRECISION,
    ADD COLUMN "content_gap_score" DOUBLE PRECISION,
    ADD COLUMN "reason_selected" JSONB,
    ADD COLUMN "enriched_at" TIMESTAMP(3);

CREATE INDEX "story_clusters_tenant_id_candidate_score_idx" ON "story_clusters"("tenant_id", "candidate_score");

-- SourceItem pipeline marker
ALTER TABLE "source_items" ADD COLUMN "intelligence_processed_at" TIMESTAMP(3);

-- DiscoveryRun cost counters
ALTER TABLE "discovery_runs" ADD COLUMN "cost_counters" JSONB;

-- Generic entity registry
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "domain" TEXT NOT NULL DEFAULT 'generic',
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "aliases" JSONB,
    "external_ids" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "entities_tenant_id_domain_type_canonical_key_key" ON "entities"("tenant_id", "domain", "type", "canonical_key");
CREATE INDEX "entities_tenant_id_type_idx" ON "entities"("tenant_id", "type");
CREATE INDEX "entities_tenant_id_name_idx" ON "entities"("tenant_id", "name");

-- Entity mentions in source items
CREATE TABLE "source_item_entities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "evidence" JSONB,
    "extraction_level" INTEGER NOT NULL DEFAULT 1,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_item_entities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "source_item_entities_item_id_entity_id_key" ON "source_item_entities"("item_id", "entity_id");
CREATE INDEX "source_item_entities_tenant_id_entity_id_idx" ON "source_item_entities"("tenant_id", "entity_id");

-- Fact ledger
CREATE TABLE "story_facts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cluster_id" UUID,
    "item_id" UUID NOT NULL,
    "fact_key" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "source_url" TEXT,
    "publisher" TEXT,
    "evidence_ref" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verification_status" TEXT NOT NULL DEFAULT 'unverified',
    "conflicting_facts" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_facts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "story_facts_tenant_id_item_id_fact_key_key" ON "story_facts"("tenant_id", "item_id", "fact_key");
CREATE INDEX "story_facts_tenant_id_cluster_id_idx" ON "story_facts"("tenant_id", "cluster_id");
CREATE INDEX "story_facts_tenant_id_fact_key_verification_status_idx" ON "story_facts"("tenant_id", "fact_key", "verification_status");

-- Provider response cache
CREATE TABLE "provider_cache_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "payload" JSONB,
    "is_negative" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_cache_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_cache_entries_tenant_id_provider_key_resource_type_cac_key" ON "provider_cache_entries"("tenant_id", "provider_key", "resource_type", "cache_key");
CREATE INDEX "provider_cache_entries_tenant_id_provider_key_expires_at_idx" ON "provider_cache_entries"("tenant_id", "provider_key", "expires_at");

-- Enriched entity metadata from external providers
CREATE TABLE "provider_enrichments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "provider_entity_id" TEXT,
    "resource_type" TEXT NOT NULL,
    "title" TEXT,
    "original_title" TEXT,
    "release_date" TIMESTAMP(3),
    "match_method" TEXT NOT NULL DEFAULT 'search',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "data" JSONB,
    "cached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_enrichments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "provider_enrichments_tenant_id_entity_id_idx" ON "provider_enrichments"("tenant_id", "entity_id");
CREATE INDEX "provider_enrichments_tenant_id_provider_key_provider_entity_id_idx" ON "provider_enrichments"("tenant_id", "provider_key", "provider_entity_id");
CREATE UNIQUE INDEX "provider_enrichments_entity_id_provider_key_key" ON "provider_enrichments"("entity_id", "provider_key");

-- Compact site editorial profile
CREATE TABLE "site_editorial_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "profile_version" INTEGER NOT NULL DEFAULT 1,
    "topics" JSONB,
    "categories" JSONB,
    "taxonomy" JSONB,
    "audience" JSONB,
    "language" TEXT,
    "location" JSONB,
    "editorial_description" TEXT,
    "content_gaps" JSONB,
    "existing_titles" JSONB,
    "sitemap_url" TEXT,
    "article_stats" JSONB,
    "built_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_editorial_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "site_editorial_profiles_site_id_key" ON "site_editorial_profiles"("site_id");

-- Mute rules
CREATE TABLE "mute_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "muted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mute_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mute_rules_tenant_id_kind_value_key" ON "mute_rules"("tenant_id", "kind", "value");
CREATE INDEX "mute_rules_tenant_id_kind_active_idx" ON "mute_rules"("tenant_id", "kind", "active");

-- Per-tenant intelligence settings
CREATE TABLE "intelligence_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "enabled_domains" JSONB,
    "provider_precedence" JSONB,
    "ai_judge" JSONB,
    "level_policy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intelligence_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "intelligence_settings_tenant_id_key" ON "intelligence_settings"("tenant_id");

-- Foreign keys
ALTER TABLE "entities" ADD CONSTRAINT "entities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_item_entities" ADD CONSTRAINT "source_item_entities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_item_entities" ADD CONSTRAINT "source_item_entities_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "source_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_item_entities" ADD CONSTRAINT "source_item_entities_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_facts" ADD CONSTRAINT "story_facts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_facts" ADD CONSTRAINT "story_facts_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "source_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_facts" ADD CONSTRAINT "story_facts_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "story_clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_cache_entries" ADD CONSTRAINT "provider_cache_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_enrichments" ADD CONSTRAINT "provider_enrichments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_enrichments" ADD CONSTRAINT "provider_enrichments_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_editorial_profiles" ADD CONSTRAINT "site_editorial_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_editorial_profiles" ADD CONSTRAINT "site_editorial_profiles_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mute_rules" ADD CONSTRAINT "mute_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "intelligence_settings" ADD CONSTRAINT "intelligence_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
