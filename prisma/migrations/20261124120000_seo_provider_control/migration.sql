-- CreateTable
CREATE TABLE "seo_provider_states" (
    "provider_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "priority" INTEGER NOT NULL,
    "last_success_at" TIMESTAMP(3),
    "last_error_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "verifications" JSONB,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_provider_states_pkey" PRIMARY KEY ("provider_id")
);

-- CreateTable
CREATE TABLE "seo_control_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "mode" TEXT NOT NULL,
    "routing" JSONB,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_control_settings_pkey" PRIMARY KEY ("id")
);