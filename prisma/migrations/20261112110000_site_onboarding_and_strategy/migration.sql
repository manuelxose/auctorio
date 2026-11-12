-- CreateTable
CREATE TABLE "site_onboarding_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "operation_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'running',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "steps" JSONB NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_onboarding_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_editorial_strategies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "suggested" JSONB,
    "suggested_source" TEXT,
    "suggested_at" TIMESTAMP(3),
    "approved" JSONB,
    "approved_version" INTEGER NOT NULL DEFAULT 0,
    "approved_at" TIMESTAMP(3),
    "approved_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_editorial_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_editorial_strategy_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "strategy_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "note" TEXT,
    "restored_from_version" INTEGER,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_editorial_strategy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_onboarding_runs_tenant_id_status_idx" ON "site_onboarding_runs"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "site_onboarding_runs_site_id_key" ON "site_onboarding_runs"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_editorial_strategies_site_id_key" ON "site_editorial_strategies"("site_id");

-- CreateIndex
CREATE INDEX "site_editorial_strategy_versions_tenant_id_site_id_idx" ON "site_editorial_strategy_versions"("tenant_id", "site_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_editorial_strategy_versions_strategy_id_version_key" ON "site_editorial_strategy_versions"("strategy_id", "version");

-- AddForeignKey
ALTER TABLE "site_onboarding_runs" ADD CONSTRAINT "site_onboarding_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_onboarding_runs" ADD CONSTRAINT "site_onboarding_runs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_editorial_strategies" ADD CONSTRAINT "site_editorial_strategies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_editorial_strategies" ADD CONSTRAINT "site_editorial_strategies_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_editorial_strategy_versions" ADD CONSTRAINT "site_editorial_strategy_versions_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "site_editorial_strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

