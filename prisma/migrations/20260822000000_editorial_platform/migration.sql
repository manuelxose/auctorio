-- Editorial platform: sources, inbox, story clusters, social content,
-- publishing accounts, durable publications, automation policies,
-- campaigns, briefs and audit log.

-- Extend existing enums
ALTER TYPE "ProjectGoal" ADD VALUE IF NOT EXISTS 'news_article';

-- New enums
CREATE TYPE "ContentSourceType" AS ENUM ('rss', 'atom', 'html', 'sitemap', 'api', 'manual');
CREATE TYPE "SourceItemStatus" AS ENUM ('discovered', 'fetched', 'parsed', 'duplicate', 'rejected', 'candidate', 'selected', 'processed', 'failed');
CREATE TYPE "StoryClusterStatus" AS ENUM ('open', 'selected', 'covered', 'rejected', 'archived');
CREATE TYPE "SocialChannel" AS ENUM ('x', 'instagram');
CREATE TYPE "SocialContentType" AS ENUM ('x_post', 'x_thread', 'instagram_caption', 'instagram_story', 'social_post');
CREATE TYPE "SocialGenerationStatus" AS ENUM ('queued', 'processing', 'done', 'failed');
CREATE TYPE "SocialEditorialStatus" AS ENUM ('draft', 'approved', 'rejected');
CREATE TYPE "PublishingAccountPlatform" AS ENUM ('website', 'x', 'instagram');
CREATE TYPE "PublishingAccountStatus" AS ENUM ('pending', 'active', 'error', 'disabled');
CREATE TYPE "PublicationChannel" AS ENUM ('website', 'x', 'instagram');
CREATE TYPE "PublicationState" AS ENUM ('draft', 'ready', 'scheduled', 'queued', 'publishing', 'published', 'failed', 'canceled', 'deleted', 'unpublished');
CREATE TYPE "PublicationAttemptStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');
CREATE TYPE "AutomationState" AS ENUM ('active', 'paused', 'degraded');

-- ContentProject editorial extensions
ALTER TABLE "content_projects"
  ADD COLUMN "source_item_id" UUID,
  ADD COLUMN "cluster_id" UUID,
  ADD COLUMN "campaign_id" UUID,
  ADD COLUMN "brief_id" UUID,
  ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" TEXT,
  ADD COLUMN "deleted_by_studio_user_id" UUID,
  ADD COLUMN "deletion_reason" TEXT;

-- New tables
CREATE TABLE "content_sources" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "site_id" UUID,
  "name" TEXT NOT NULL,
  "type" "ContentSourceType" NOT NULL,
  "url" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "trust_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "language" TEXT NOT NULL DEFAULT 'es',
  "country" TEXT,
  "categories" JSONB,
  "tags" JSONB,
  "refresh_interval_minutes" INTEGER NOT NULL DEFAULT 30,
  "last_fetched_at" TIMESTAMP(3),
  "last_success_at" TIMESTAMP(3),
  "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
  "configuration" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_items" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "cluster_id" UUID,
  "external_id" TEXT NOT NULL,
  "canonical_url" TEXT,
  "source_url" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "raw_text" TEXT,
  "cleaned_text" TEXT,
  "author" TEXT,
  "published_at" TIMESTAMP(3),
  "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "source_image_urls" JSONB,
  "language" TEXT,
  "categories" JSONB,
  "entities" JSONB,
  "content_hash" TEXT NOT NULL,
  "semantic_hash" TEXT,
  "metadata" JSONB,
  "processing_status" "SourceItemStatus" NOT NULL DEFAULT 'discovered',
  "score" DOUBLE PRECISION,
  "score_explanation" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "story_clusters" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "primary_topic" TEXT,
  "headline" TEXT,
  "summary" TEXT,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "score" DOUBLE PRECISION,
  "status" "StoryClusterStatus" NOT NULL DEFAULT 'open',
  "source_count" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "story_clusters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "social_content" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "channel" "SocialChannel" NOT NULL,
  "content_type" "SocialContentType" NOT NULL,
  "body" TEXT NOT NULL,
  "title" TEXT,
  "hashtags" JSONB,
  "mentions" JSONB,
  "media_asset_ids" JSONB,
  "character_count" INTEGER,
  "generation_status" "SocialGenerationStatus" NOT NULL DEFAULT 'queued',
  "editorial_status" "SocialEditorialStatus" NOT NULL DEFAULT 'draft',
  "thread_position" INTEGER,
  "metadata" JSONB,
  "prompt_preset_version_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "social_content_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "publishing_accounts" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "site_id" UUID,
  "platform" "PublishingAccountPlatform" NOT NULL,
  "display_name" TEXT NOT NULL,
  "external_account_id" TEXT,
  "credentials_ref" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "status" "PublishingAccountStatus" NOT NULL DEFAULT 'pending',
  "configuration" JSONB,
  "last_verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "publishing_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "publications" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "channel" "PublicationChannel" NOT NULL,
  "account_id" UUID,
  "site_id" UUID,
  "social_content_id" UUID,
  "campaign_id" UUID,
  "publication_job_id" TEXT,
  "status" "PublicationState" NOT NULL DEFAULT 'draft',
  "scheduled_for" TIMESTAMP(3),
  "published_at" TIMESTAMP(3),
  "external_id" TEXT,
  "external_url" TEXT,
  "current_attempt" INTEGER NOT NULL DEFAULT 0,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMP(3),
  "last_error" TEXT,
  "failure_class" TEXT,
  "failure_reason" TEXT,
  "manual_override" BOOLEAN NOT NULL DEFAULT false,
  "schedule_locked" BOOLEAN NOT NULL DEFAULT false,
  "idempotency_key" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "publication_attempts" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "publication_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "status" "PublicationAttemptStatus" NOT NULL DEFAULT 'queued',
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "external_id" TEXT,
  "external_url" TEXT,
  "request_payload" JSONB,
  "response_payload" JSONB,
  "error" TEXT,
  "error_class" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "publication_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_policies" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "site_id" UUID,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "state" "AutomationState" NOT NULL DEFAULT 'active',
  "paused_reason" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
  "articles_per_day" INTEGER NOT NULL DEFAULT 3,
  "max_articles_per_day" INTEGER NOT NULL DEFAULT 6,
  "x_posts_per_day" INTEGER NOT NULL DEFAULT 5,
  "instagram_posts_per_day" INTEGER NOT NULL DEFAULT 2,
  "minimum_minutes_between_articles" INTEGER NOT NULL DEFAULT 120,
  "active_days_of_week" JSONB,
  "publishing_windows" JSONB,
  "auto_generate" BOOLEAN NOT NULL DEFAULT false,
  "auto_approve" BOOLEAN NOT NULL DEFAULT false,
  "auto_schedule" BOOLEAN NOT NULL DEFAULT false,
  "auto_publish" BOOLEAN NOT NULL DEFAULT false,
  "minimum_story_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "categories" JSONB,
  "excluded_categories" JSONB,
  "priority_topics" JSONB,
  "image_required" BOOLEAN NOT NULL DEFAULT true,
  "social_required" BOOLEAN NOT NULL DEFAULT true,
  "maximum_queue_size" INTEGER NOT NULL DEFAULT 20,
  "articles_per_hour" INTEGER NOT NULL DEFAULT 2,
  "social_posts_per_hour" INTEGER NOT NULL DEFAULT 6,
  "maximum_daily_social" INTEGER NOT NULL DEFAULT 12,
  "social_timing_minutes_x" INTEGER NOT NULL DEFAULT 5,
  "social_timing_minutes_instagram" INTEGER NOT NULL DEFAULT 60,
  "source_selection_rules" JSONB,
  "updated_by_studio_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaigns" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "start_at" TIMESTAMP(3),
  "end_at" TIMESTAMP(3),
  "tags" JSONB,
  "status" TEXT NOT NULL DEFAULT 'active',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "editorial_briefs" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "topic" TEXT,
  "audience" TEXT,
  "tone" TEXT,
  "structure" JSONB,
  "keywords" JSONB,
  "seo_intent" TEXT,
  "channels" JSONB,
  "image_style" TEXT,
  "source_restrictions" JSONB,
  "publication_frequency" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "editorial_briefs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_user_id" UUID,
  "action" TEXT NOT NULL,
  "entity_type" TEXT,
  "entity_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "content_sources_tenant_id_name_key" ON "content_sources"("tenant_id", "name");
CREATE UNIQUE INDEX "source_items_tenant_id_source_id_external_id_key" ON "source_items"("tenant_id", "source_id", "external_id");
CREATE UNIQUE INDEX "source_items_tenant_id_content_hash_key" ON "source_items"("tenant_id", "content_hash");
CREATE UNIQUE INDEX "automation_policies_tenant_id_site_id_key" ON "automation_policies"("tenant_id", "site_id");
CREATE UNIQUE INDEX "publications_tenant_id_idempotency_key_key" ON "publications"("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;

-- Lookup indexes
CREATE INDEX "content_sources_tenant_id_enabled_last_fetched_at_idx" ON "content_sources"("tenant_id", "enabled", "last_fetched_at");
CREATE INDEX "source_items_tenant_id_processing_status_discovered_at_idx" ON "source_items"("tenant_id", "processing_status", "discovered_at");
CREATE INDEX "source_items_tenant_id_cluster_id_idx" ON "source_items"("tenant_id", "cluster_id");
CREATE INDEX "story_clusters_tenant_id_status_last_seen_at_idx" ON "story_clusters"("tenant_id", "status", "last_seen_at");
CREATE INDEX "social_content_tenant_id_project_id_channel_idx" ON "social_content"("tenant_id", "project_id", "channel");
CREATE INDEX "social_content_tenant_id_version_id_channel_idx" ON "social_content"("tenant_id", "version_id", "channel");
CREATE INDEX "publishing_accounts_tenant_id_platform_status_idx" ON "publishing_accounts"("tenant_id", "platform", "status");
CREATE INDEX "publications_tenant_id_status_scheduled_for_idx" ON "publications"("tenant_id", "status", "scheduled_for");
CREATE INDEX "publications_tenant_id_project_id_channel_idx" ON "publications"("tenant_id", "project_id", "channel");
CREATE INDEX "publications_tenant_id_channel_status_idx" ON "publications"("tenant_id", "channel", "status");
CREATE INDEX "publication_attempts_tenant_id_publication_id_attempt_number_idx" ON "publication_attempts"("tenant_id", "publication_id", "attempt_number");
CREATE INDEX "campaigns_tenant_id_status_idx" ON "campaigns"("tenant_id", "status");
CREATE INDEX "editorial_briefs_tenant_id_active_idx" ON "editorial_briefs"("tenant_id", "active");
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");
CREATE INDEX "audit_logs_tenant_id_entity_type_entity_id_idx" ON "audit_logs"("tenant_id", "entity_type", "entity_id");
CREATE INDEX "content_projects_tenant_id_deleted_at_idx" ON "content_projects"("tenant_id", "deleted_at");
CREATE INDEX "content_projects_tenant_id_source_item_id_idx" ON "content_projects"("tenant_id", "source_item_id");

-- Foreign keys
ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "content_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "story_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "story_clusters" ADD CONSTRAINT "story_clusters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_content" ADD CONSTRAINT "social_content_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_content" ADD CONSTRAINT "social_content_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "content_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_content" ADD CONSTRAINT "social_content_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "content_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_content" ADD CONSTRAINT "social_content_prompt_preset_version_id_fkey" FOREIGN KEY ("prompt_preset_version_id") REFERENCES "studio_prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "publishing_accounts" ADD CONSTRAINT "publishing_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publishing_accounts" ADD CONSTRAINT "publishing_accounts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "content_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "content_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "publishing_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_social_content_id_fkey" FOREIGN KEY ("social_content_id") REFERENCES "social_content"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_policies" ADD CONSTRAINT "automation_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_policies" ADD CONSTRAINT "automation_policies_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "editorial_briefs" ADD CONSTRAINT "editorial_briefs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "studio_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "source_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "story_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_brief_id_fkey" FOREIGN KEY ("brief_id") REFERENCES "editorial_briefs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
