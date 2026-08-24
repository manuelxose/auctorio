-- Site intelligence foundation: connected-site knowledge model.
-- Additive only. No drops, no destructive changes.

CREATE TABLE "site_sitemaps" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'discovered',
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "last_fetched_at" TIMESTAMP(3),
    "last_status_code" INTEGER,
    "url_count" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "site_sitemaps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_sitemaps_site_id_url_key" UNIQUE ("site_id", "url")
);

CREATE TABLE "site_indexed_pages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "sitemap_id" UUID,
    "url" TEXT NOT NULL,
    "canonical_url" TEXT,
    "title" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "h1" TEXT,
    "headings" JSONB,
    "content" TEXT,
    "word_count" INTEGER,
    "published_at" TIMESTAMP(3),
    "modified_at" TIMESTAMP(3),
    "author" TEXT,
    "categories" JSONB,
    "tags" JSONB,
    "images" JSONB,
    "structured_data" JSONB,
    "og_metadata" JSONB,
    "language" TEXT,
    "content_type" TEXT,
    "crawl_state" TEXT NOT NULL DEFAULT 'discovered',
    "content_hash" TEXT,
    "first_indexed_at" TIMESTAMP(3),
    "last_indexed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "site_indexed_pages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_indexed_pages_site_id_url_key" UNIQUE ("site_id", "url")
);

CREATE TABLE "site_topic_clusters" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "pages_count" INTEGER NOT NULL DEFAULT 0,
    "authority_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gap_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "keywords" JSONB,
    "sample_urls" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "site_topic_clusters_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_topic_clusters_site_id_slug_key" UNIQUE ("site_id", "slug")
);

CREATE TABLE "site_entities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "mentions" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "site_entities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_entities_site_id_name_type_key" UNIQUE ("site_id", "name", "type")
);

CREATE TABLE "site_internal_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "source_page_id" UUID NOT NULL,
    "target_url" TEXT NOT NULL,
    "anchor_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "site_internal_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_internal_links_source_target_key" UNIQUE ("source_page_id", "target_url")
);

CREATE TABLE "site_intelligence_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "indexed_at" TIMESTAMP(3),
    "source_count" INTEGER NOT NULL DEFAULT 0,
    "page_count" INTEGER NOT NULL DEFAULT 0,
    "detected_site_type" TEXT,
    "detected_language" TEXT,
    "detected_audience" TEXT,
    "brand_summary" TEXT,
    "main_topics" JSONB,
    "excluded_topics" JSONB,
    "categories" JSONB,
    "entities" JSONB,
    "content_types" JSONB,
    "topic_clusters" JSONB,
    "existing_content_patterns" JSONB,
    "editorial_tone" TEXT,
    "formatting_patterns" JSONB,
    "common_article_length" INTEGER,
    "internal_link_targets" JSONB,
    "commercial_topics" JSONB,
    "evergreen_topics" JSONB,
    "news_topics" JSONB,
    "sports_topics" JSONB,
    "topical_authority_map" JSONB,
    "discovered_sitemaps" JSONB,
    "crawl_health" JSONB,
    "confidence" DOUBLE PRECISION,
    "warnings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "site_intelligence_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "site_intelligence_profiles_site_id_key" UNIQUE ("site_id")
);

CREATE TABLE "search_targets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "query" TEXT NOT NULL,
    "keyword" TEXT,
    "intent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "search_targets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "search_targets_site_id_query_key" UNIQUE ("site_id", "query")
);

CREATE TABLE "editorial_plan_generation_attempts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "site_id" UUID,
    "provider" TEXT,
    "model" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'started',
    "finish_reason" TEXT,
    "token_usage" JSONB,
    "schema_validation" JSONB,
    "normalized_error" TEXT,
    "repair_attempted" BOOLEAN NOT NULL DEFAULT false,
    "retry_attempted" BOOLEAN NOT NULL DEFAULT false,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "editorial_plan_generation_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "site_sitemaps_tenant_id_site_id_idx" ON "site_sitemaps"("tenant_id", "site_id");
CREATE INDEX "site_indexed_pages_tenant_id_site_id_idx" ON "site_indexed_pages"("tenant_id", "site_id");
CREATE INDEX "site_indexed_pages_site_id_crawl_state_idx" ON "site_indexed_pages"("site_id", "crawl_state");
CREATE INDEX "site_topic_clusters_site_id_idx" ON "site_topic_clusters"("site_id");
CREATE INDEX "site_entities_site_id_idx" ON "site_entities"("site_id");
CREATE INDEX "site_internal_links_site_id_target_url_idx" ON "site_internal_links"("site_id", "target_url");
CREATE INDEX "search_targets_tenant_id_site_id_idx" ON "search_targets"("tenant_id", "site_id");
CREATE INDEX "editorial_plan_generation_attempts_plan_id_idx" ON "editorial_plan_generation_attempts"("plan_id");
CREATE INDEX "editorial_plan_generation_attempts_tenant_id_created_at_idx" ON "editorial_plan_generation_attempts"("tenant_id", "created_at");

ALTER TABLE "site_sitemaps" ADD CONSTRAINT "site_sitemaps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_sitemaps" ADD CONSTRAINT "site_sitemaps_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_indexed_pages" ADD CONSTRAINT "site_indexed_pages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_indexed_pages" ADD CONSTRAINT "site_indexed_pages_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_indexed_pages" ADD CONSTRAINT "site_indexed_pages_sitemap_id_fkey" FOREIGN KEY ("sitemap_id") REFERENCES "site_sitemaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "site_topic_clusters" ADD CONSTRAINT "site_topic_clusters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_topic_clusters" ADD CONSTRAINT "site_topic_clusters_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_entities" ADD CONSTRAINT "site_entities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_entities" ADD CONSTRAINT "site_entities_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_internal_links" ADD CONSTRAINT "site_internal_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_internal_links" ADD CONSTRAINT "site_internal_links_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_internal_links" ADD CONSTRAINT "site_internal_links_source_page_id_fkey" FOREIGN KEY ("source_page_id") REFERENCES "site_indexed_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_intelligence_profiles" ADD CONSTRAINT "site_intelligence_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_intelligence_profiles" ADD CONSTRAINT "site_intelligence_profiles_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "search_targets" ADD CONSTRAINT "search_targets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "search_targets" ADD CONSTRAINT "search_targets_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "editorial_plan_generation_attempts" ADD CONSTRAINT "editorial_plan_generation_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "editorial_plan_generation_attempts" ADD CONSTRAINT "editorial_plan_generation_attempts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "editorial_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
