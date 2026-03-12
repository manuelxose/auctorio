CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended');
CREATE TYPE "TopicStatus" AS ENUM ('active', 'archived');
CREATE TYPE "FactSourceType" AS ENUM ('manual', 'rss', 'html', 'api');
CREATE TYPE "ContentTextType" AS ENUM ('seo', 'instagram');
CREATE TYPE "ContentStatus" AS ENUM ('queued', 'processing', 'done', 'failed', 'canceled');
CREATE TYPE "JobType" AS ENUM ('scraping', 'text', 'image');
CREATE TYPE "JobStatus" AS ENUM ('queued', 'processing', 'done', 'failed', 'canceled');
CREATE TYPE "LanguageCode" AS ENUM ('es', 'en');

CREATE TABLE "tenants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "api_key_hash" TEXT NOT NULL,
  "status" "TenantStatus" NOT NULL DEFAULT 'active',
  "plan" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "topics" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "TopicStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "topics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "topics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "facts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "topic_id" UUID NOT NULL,
  "source_type" "FactSourceType" NOT NULL,
  "source_ref" TEXT,
  "content" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "facts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "facts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "facts_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "content_text" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "topic_id" UUID NOT NULL,
  "type" "ContentTextType" NOT NULL,
  "language" "LanguageCode" NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'queued',
  "provider" TEXT,
  "model" TEXT,
  "prompt" TEXT,
  "output" TEXT,
  "prompt_version" TEXT,
  "tokens_input" INTEGER,
  "tokens_output" INTEGER,
  "cost_usd" DECIMAL(12, 6),
  "error" TEXT,
  "dedupe_hash" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "content_text_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_text_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "content_text_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "content_image" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "topic_id" UUID NOT NULL,
  "text_id" UUID,
  "status" "ContentStatus" NOT NULL DEFAULT 'queued',
  "provider" TEXT,
  "model" TEXT,
  "prompt" TEXT,
  "storage_path" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "cost_usd" DECIMAL(12, 6),
  "error" TEXT,
  "dedupe_hash" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "content_image_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_image_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "content_image_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "content_image_text_id_fkey" FOREIGN KEY ("text_id") REFERENCES "content_text"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "type" "JobType" NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'queued',
  "idempotency_key" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "started_at" TIMESTAMPTZ,
  "finished_at" TIMESTAMPTZ,
  CONSTRAINT "jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ai_audit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "job_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "response" TEXT,
  "usage_json" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ai_audit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_audit_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ai_audit_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "tenants_name_key" ON "tenants"("name");
CREATE UNIQUE INDEX "tenants_api_key_hash_key" ON "tenants"("api_key_hash");

CREATE UNIQUE INDEX "topics_tenant_id_title_key" ON "topics"("tenant_id", "title");
CREATE INDEX "topics_tenant_id_status_idx" ON "topics"("tenant_id", "status");

CREATE INDEX "facts_tenant_id_topic_id_idx" ON "facts"("tenant_id", "topic_id");
CREATE UNIQUE INDEX "facts_tenant_id_topic_id_content_hash_key" ON "facts"("tenant_id", "topic_id", "content_hash");

CREATE INDEX "content_text_tenant_id_topic_id_status_idx" ON "content_text"("tenant_id", "topic_id", "status");
CREATE UNIQUE INDEX "content_text_tenant_id_dedupe_hash_key" ON "content_text"("tenant_id", "dedupe_hash");

CREATE INDEX "content_image_tenant_id_topic_id_status_idx" ON "content_image"("tenant_id", "topic_id", "status");
CREATE INDEX "content_image_tenant_id_text_id_idx" ON "content_image"("tenant_id", "text_id");
CREATE UNIQUE INDEX "content_image_tenant_id_dedupe_hash_key" ON "content_image"("tenant_id", "dedupe_hash");

CREATE INDEX "jobs_tenant_id_status_type_idx" ON "jobs"("tenant_id", "status", "type");
CREATE UNIQUE INDEX "jobs_tenant_id_idempotency_key" ON "jobs"("tenant_id", "idempotency_key");

CREATE INDEX "ai_audit_tenant_id_job_id_idx" ON "ai_audit"("tenant_id", "job_id");
