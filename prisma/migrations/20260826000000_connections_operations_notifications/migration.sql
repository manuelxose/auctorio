-- CreateEnum
CREATE TYPE "InstallationKind" AS ENUM ('website', 'x', 'instagram');

-- CreateEnum
CREATE TYPE "InstallationState" AS ENUM ('draft', 'discovering', 'credentials_required', 'verifying', 'ready', 'active', 'failed', 'expired', 'disabled', 'cancelled');

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('queued', 'running', 'retrying', 'succeeded', 'partial', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('info', 'success', 'warning', 'error');

-- CreateTable
CREATE TABLE "connector_installations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID,
    "kind" "InstallationKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "state" "InstallationState" NOT NULL DEFAULT 'draft',
    "display_name" TEXT,
    "external_account_id" TEXT,
    "config" JSONB,
    "discovered" JSONB,
    "capabilities" JSONB,
    "credentials_ciphertext" TEXT,
    "credentials_ref" TEXT,
    "secret_fingerprint" TEXT,
    "last_error" TEXT,
    "verified_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_studio_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connector_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID,
    "type" TEXT NOT NULL,
    "status" "OperationStatus" NOT NULL DEFAULT 'queued',
    "phase" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "total_steps" INTEGER NOT NULL DEFAULT 0,
    "completed_steps" INTEGER NOT NULL DEFAULT 0,
    "initiator_user_id" UUID,
    "entity_type" TEXT,
    "entity_id" UUID,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error_summary" TEXT,
    "error_code" TEXT,
    "queue_name" TEXT,
    "job_key" TEXT,
    "metadata" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "site_id" UUID,
    "category" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "action_url" TEXT,
    "dedupe_key" TEXT,
    "read_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connector_installations_tenant_id_kind_state_idx" ON "connector_installations"("tenant_id", "kind", "state");

-- CreateIndex
CREATE INDEX "connector_installations_tenant_id_state_idx" ON "connector_installations"("tenant_id", "state");

-- CreateIndex
CREATE INDEX "connector_installations_tenant_id_site_id_idx" ON "connector_installations"("tenant_id", "site_id");

-- CreateIndex
CREATE INDEX "operations_tenant_id_created_at_idx" ON "operations"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "operations_tenant_id_status_idx" ON "operations"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "operations_tenant_id_site_id_created_at_idx" ON "operations"("tenant_id", "site_id", "created_at");

-- CreateIndex
CREATE INDEX "operations_tenant_id_job_key_idx" ON "operations"("tenant_id", "job_key");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_read_at_created_at_idx" ON "notifications"("tenant_id", "user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_category_created_at_idx" ON "notifications"("tenant_id", "category", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_dedupe_key_key" ON "notifications"("tenant_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_tenant_id_user_id_category_key" ON "notification_preferences"("tenant_id", "user_id", "category");

-- AddForeignKey
ALTER TABLE "connector_installations" ADD CONSTRAINT "connector_installations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_installations" ADD CONSTRAINT "connector_installations_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "site_internal_links_source_target_key" RENAME TO "site_internal_links_source_page_id_target_url_key";

