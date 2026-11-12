-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Madrid';

-- CreateTable
CREATE TABLE "editorial_plan_presets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "editorial_plan_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_planning_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "articles_per_day" INTEGER NOT NULL DEFAULT 1,
    "weekdays" JSONB NOT NULL,
    "publish_times" JSONB NOT NULL,
    "channels" JSONB NOT NULL,
    "default_preset_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_planning_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "editorial_plan_presets_tenant_id_site_id_idx" ON "editorial_plan_presets"("tenant_id", "site_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_planning_settings_site_id_key" ON "site_planning_settings"("site_id");

-- CreateIndex
CREATE INDEX "site_planning_settings_tenant_id_idx" ON "site_planning_settings"("tenant_id");

-- AddForeignKey
ALTER TABLE "editorial_plan_presets" ADD CONSTRAINT "editorial_plan_presets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_plan_presets" ADD CONSTRAINT "editorial_plan_presets_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_planning_settings" ADD CONSTRAINT "site_planning_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_planning_settings" ADD CONSTRAINT "site_planning_settings_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_planning_settings" ADD CONSTRAINT "site_planning_settings_default_preset_id_fkey" FOREIGN KEY ("default_preset_id") REFERENCES "editorial_plan_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

