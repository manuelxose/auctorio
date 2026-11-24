-- AlterTable
ALTER TABLE "ai_spend_events" ADD COLUMN     "reservation_id" UUID;

-- AlterTable
ALTER TABLE "provider_cache_entries" ADD COLUMN     "fetched_at" TIMESTAMP(3),
ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "seo_control_settings" ADD COLUMN     "emergency_at" TIMESTAMP(3),
ADD COLUMN     "emergency_reason" TEXT,
ADD COLUMN     "emergency_stop" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paid_fallback" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "policy" JSONB,
ADD COLUMN     "pricing" JSONB;

-- AlterTable
ALTER TABLE "seo_provider_states" ADD COLUMN     "circuit_open_until" TIMESTAMP(3),
ADD COLUMN     "circuit_reason" TEXT,
ADD COLUMN     "consecutive_failures" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "seo_budgets" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL DEFAULT '*',
    "allowance" TEXT NOT NULL DEFAULT 'any',
    "period" TEXT NOT NULL,
    "limit_usd" DECIMAL(12,6) NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_budget_authorizations" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL DEFAULT '*',
    "allowance" TEXT NOT NULL DEFAULT 'any',
    "period" TEXT NOT NULL,
    "amount_usd" DECIMAL(12,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_budget_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_spend_reservations" (
    "id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "target_site_id" UUID,
    "provider_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "allowance" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL,
    "estimated_usd" DECIMAL(12,6),
    "max_usd" DECIMAL(12,6) NOT NULL,
    "actual_usd" DECIMAL(12,6),
    "pricing_version" TEXT NOT NULL,
    "lease_until" TIMESTAMP(3) NOT NULL,
    "dispatched_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "resolution" TEXT,
    "resolved_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_spend_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_acquisition_leases" (
    "key" TEXT NOT NULL,
    "reservation_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_acquisition_leases_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "seo_snapshots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "meta" JSONB NOT NULL,
    "reservation_id" UUID NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "retain_until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seo_budgets_key" ON "seo_budgets"("scope", "scope_id", "operation", "allowance", "period");

-- CreateIndex
CREATE INDEX "seo_budget_authorizations_expires_at_idx" ON "seo_budget_authorizations"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "seo_spend_reservations_idempotency_key_key" ON "seo_spend_reservations"("idempotency_key");

-- CreateIndex
CREATE INDEX "seo_spend_reservations_created_at_idx" ON "seo_spend_reservations"("created_at");

-- CreateIndex
CREATE INDEX "seo_spend_reservations_tenant_id_created_at_idx" ON "seo_spend_reservations"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "seo_spend_reservations_state_lease_until_idx" ON "seo_spend_reservations"("state", "lease_until");

-- CreateIndex
CREATE INDEX "seo_spend_reservations_provider_id_dispatched_at_idx" ON "seo_spend_reservations"("provider_id", "dispatched_at");

-- CreateIndex
CREATE INDEX "seo_acquisition_leases_reservation_id_idx" ON "seo_acquisition_leases"("reservation_id");

-- CreateIndex
CREATE INDEX "seo_acquisition_leases_until_idx" ON "seo_acquisition_leases"("until");

-- CreateIndex
CREATE INDEX "seo_snapshots_tenant_id_provider_id_operation_fetched_at_idx" ON "seo_snapshots"("tenant_id", "provider_id", "operation", "fetched_at");

-- CreateIndex
CREATE INDEX "seo_snapshots_retain_until_idx" ON "seo_snapshots"("retain_until");

-- CreateIndex
CREATE UNIQUE INDEX "ai_spend_events_reservation_id_key" ON "ai_spend_events"("reservation_id");

-- AddForeignKey
ALTER TABLE "seo_snapshots" ADD CONSTRAINT "seo_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
