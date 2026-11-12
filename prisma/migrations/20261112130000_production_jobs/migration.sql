-- Additive (agent D): durable production jobs for the unified production pipeline.
-- CreateEnum
CREATE TYPE "ProductionJobStatus" AS ENUM ('queued', 'running', 'needs_review', 'ready', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "production_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "plan_item_id" UUID,
    "cluster_id" UUID,
    "project_id" UUID,
    "version_id" UUID,
    "generation_id" UUID,
    "operation_id" UUID,
    "status" "ProductionJobStatus" NOT NULL DEFAULT 'queued',
    "stage" TEXT NOT NULL DEFAULT 'prepare',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "error_code" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "artifacts" JSONB,
    "initiator_user_id" UUID,
    "review_decision" TEXT,
    "review_notes" TEXT,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "cancel_requested_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "production_jobs_idempotency_key_key" ON "production_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "production_jobs_tenant_id_site_id_status_idx" ON "production_jobs"("tenant_id", "site_id", "status");

-- CreateIndex
CREATE INDEX "production_jobs_tenant_id_status_created_at_idx" ON "production_jobs"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "production_jobs_tenant_id_plan_item_id_idx" ON "production_jobs"("tenant_id", "plan_item_id");

-- CreateIndex
CREATE INDEX "production_jobs_tenant_id_cluster_id_idx" ON "production_jobs"("tenant_id", "cluster_id");

-- AddForeignKey
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

