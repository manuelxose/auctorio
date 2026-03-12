-- CreateEnum
CREATE TYPE "SiteType" AS ENUM ('guiatv', 'tecnoria', 'webhook');

-- CreateEnum
CREATE TYPE "ProjectGoal" AS ENUM ('article', 'landing', 'comparison', 'faq', 'newsletter', 'social_pack');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'ai_generated', 'qa_failed', 'qa_passed', 'in_review', 'approved', 'publish_queued', 'published', 'publish_failed');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('draft', 'ai_generated', 'qa_failed', 'qa_passed', 'approved', 'published', 'archived');

-- CreateEnum
CREATE TYPE "DerivativeType" AS ENUM ('newsletter_subject', 'newsletter_intro', 'social_post', 'social_caption', 'social_thread');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('queued', 'processing', 'draft_synced', 'published', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "PublicationAction" AS ENUM ('publish', 'update', 'unpublish');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('original', 'hero', 'thumbnail', 'social_square', 'social_story');

-- AlterTable
ALTER TABLE "ai_audit" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "content_image" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "content_text" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "facts" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jobs" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "started_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "finished_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tenants" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "topics" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SiteType" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es-ES',
    "base_url" TEXT,
    "brand_voice" JSONB,
    "seo_rules" JSONB,
    "taxonomy_map" JSONB,
    "publishing_credentials_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_projects" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "topic_id" UUID,
    "title" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "goal" "ProjectGoal" NOT NULL DEFAULT 'article',
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "primary_language" TEXT NOT NULL DEFAULT 'es',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "content_text_id" UUID,
    "content_image_id" UUID,
    "version_number" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT,
    "excerpt" TEXT,
    "body_html" TEXT,
    "seo_title" TEXT,
    "seo_description" TEXT,
    "qa_report" JSONB,
    "feedback" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_derivatives" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "type" "DerivativeType" NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'done',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_derivatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'queued',
    "action" "PublicationAction" NOT NULL DEFAULT 'publish',
    "external_id" TEXT,
    "external_url" TEXT,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "error" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publication_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_variants" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID,
    "content_image_id" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL DEFAULT 'original',
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sites_tenant_id_type_idx" ON "sites"("tenant_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "sites_tenant_id_key_key" ON "sites"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "content_projects_tenant_id_site_id_status_idx" ON "content_projects"("tenant_id", "site_id", "status");

-- CreateIndex
CREATE INDEX "content_projects_tenant_id_topic_id_idx" ON "content_projects"("tenant_id", "topic_id");

-- CreateIndex
CREATE INDEX "content_versions_tenant_id_project_id_status_idx" ON "content_versions"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "content_versions_tenant_id_content_text_id_idx" ON "content_versions"("tenant_id", "content_text_id");

-- CreateIndex
CREATE INDEX "content_versions_tenant_id_content_image_id_idx" ON "content_versions"("tenant_id", "content_image_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_versions_project_id_version_number_key" ON "content_versions"("project_id", "version_number");

-- CreateIndex
CREATE INDEX "content_derivatives_tenant_id_project_id_version_id_idx" ON "content_derivatives"("tenant_id", "project_id", "version_id");

-- CreateIndex
CREATE INDEX "publication_jobs_tenant_id_site_id_status_idx" ON "publication_jobs"("tenant_id", "site_id", "status");

-- CreateIndex
CREATE INDEX "publication_jobs_tenant_id_project_id_version_id_idx" ON "publication_jobs"("tenant_id", "project_id", "version_id");

-- CreateIndex
CREATE INDEX "asset_variants_tenant_id_content_image_id_kind_idx" ON "asset_variants"("tenant_id", "content_image_id", "kind");

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "content_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_content_text_id_fkey" FOREIGN KEY ("content_text_id") REFERENCES "content_text"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_content_image_id_fkey" FOREIGN KEY ("content_image_id") REFERENCES "content_image"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_derivatives" ADD CONSTRAINT "content_derivatives_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_derivatives" ADD CONSTRAINT "content_derivatives_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "content_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_derivatives" ADD CONSTRAINT "content_derivatives_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_jobs" ADD CONSTRAINT "publication_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_jobs" ADD CONSTRAINT "publication_jobs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_jobs" ADD CONSTRAINT "publication_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "content_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_jobs" ADD CONSTRAINT "publication_jobs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_variants" ADD CONSTRAINT "asset_variants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_variants" ADD CONSTRAINT "asset_variants_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_variants" ADD CONSTRAINT "asset_variants_content_image_id_fkey" FOREIGN KEY ("content_image_id") REFERENCES "content_image"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "jobs_tenant_id_idempotency_key" RENAME TO "jobs_tenant_id_idempotency_key_key";

