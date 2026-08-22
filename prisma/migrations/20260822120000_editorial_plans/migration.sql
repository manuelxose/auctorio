CREATE TYPE "EditorialPlanStatus" AS ENUM ('draft', 'generating', 'ready', 'failed', 'archived');
CREATE TYPE "EditorialPlanItemStatus" AS ENUM ('proposed', 'approved', 'rejected', 'content_pending', 'generating', 'content_ready', 'review_required', 'scheduled', 'published', 'canceled');

CREATE TABLE "editorial_plans" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "site_id" UUID,
  "brief_id" UUID,
  "name" TEXT NOT NULL,
  "status" "EditorialPlanStatus" NOT NULL DEFAULT 'draft',
  "date_from" TIMESTAMP(3) NOT NULL,
  "date_to" TIMESTAMP(3) NOT NULL,
  "objective" TEXT,
  "channels" JSONB,
  "account_ids" JSONB,
  "frequency" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
  "configuration" JSONB,
  "provider" TEXT,
  "model" TEXT,
  "prompt_version" TEXT,
  "generated_output" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "editorial_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "editorial_plan_items" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "site_id" UUID,
  "account_id" UUID,
  "campaign_id" UUID,
  "source_item_id" UUID,
  "project_id" UUID,
  "assigned_user_id" UUID,
  "scheduled_for" TIMESTAMP(3),
  "title" TEXT NOT NULL,
  "working_title" TEXT,
  "topic" TEXT,
  "channel" "PublicationChannel" NOT NULL,
  "news_or_evergreen" TEXT,
  "objective" TEXT,
  "audience" TEXT,
  "search_intent" TEXT,
  "primary_keyword" TEXT,
  "secondary_keywords" JSONB,
  "related_entities" JSONB,
  "suggested_slug" TEXT,
  "seo_title" TEXT,
  "meta_description" TEXT,
  "social_hook" TEXT,
  "cta" TEXT,
  "suggested_hashtags" JSONB,
  "image_concept" TEXT,
  "image_requirements" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "status" "EditorialPlanItemStatus" NOT NULL DEFAULT 'proposed',
  "content_generation_status" TEXT NOT NULL DEFAULT 'pending',
  "approval_status" TEXT NOT NULL DEFAULT 'pending',
  "publication_status" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "editorial_plan_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "editorial_plans_tenant_id_status_date_from_date_to_idx" ON "editorial_plans"("tenant_id", "status", "date_from", "date_to");
CREATE INDEX "editorial_plans_tenant_id_site_id_created_at_idx" ON "editorial_plans"("tenant_id", "site_id", "created_at");
CREATE INDEX "editorial_plan_items_tenant_id_plan_id_status_idx" ON "editorial_plan_items"("tenant_id", "plan_id", "status");
CREATE INDEX "editorial_plan_items_tenant_id_channel_scheduled_for_idx" ON "editorial_plan_items"("tenant_id", "channel", "scheduled_for");
CREATE INDEX "editorial_plan_items_tenant_id_site_id_scheduled_for_idx" ON "editorial_plan_items"("tenant_id", "site_id", "scheduled_for");
CREATE INDEX "editorial_plan_items_tenant_id_project_id_idx" ON "editorial_plan_items"("tenant_id", "project_id");

ALTER TABLE "editorial_plans" ADD CONSTRAINT "editorial_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "editorial_plans" ADD CONSTRAINT "editorial_plans_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "editorial_plans" ADD CONSTRAINT "editorial_plans_brief_id_fkey" FOREIGN KEY ("brief_id") REFERENCES "editorial_briefs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "editorial_plan_items" ADD CONSTRAINT "editorial_plan_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "editorial_plan_items" ADD CONSTRAINT "editorial_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "editorial_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "editorial_plan_items" ADD CONSTRAINT "editorial_plan_items_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "editorial_plan_items" ADD CONSTRAINT "editorial_plan_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "publishing_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "editorial_plan_items" ADD CONSTRAINT "editorial_plan_items_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "editorial_plan_items" ADD CONSTRAINT "editorial_plan_items_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "source_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "editorial_plan_items" ADD CONSTRAINT "editorial_plan_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "content_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "editorial_plan_items" ADD CONSTRAINT "editorial_plan_items_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "studio_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
