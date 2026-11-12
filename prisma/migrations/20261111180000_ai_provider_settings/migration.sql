CREATE TABLE "ai_provider_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_provider_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_provider_settings_tenant_id_key" ON "ai_provider_settings"("tenant_id");

ALTER TABLE "ai_provider_settings" ADD CONSTRAINT "ai_provider_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
