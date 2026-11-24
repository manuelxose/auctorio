-- AlterEnum
ALTER TYPE "SocialChannel" ADD VALUE 'facebook';

-- AlterEnum
ALTER TYPE "SocialContentType" ADD VALUE 'instagram_carousel';
ALTER TYPE "SocialContentType" ADD VALUE 'facebook_post';

-- AlterEnum
ALTER TYPE "PublishingAccountPlatform" ADD VALUE 'facebook';

-- CreateTable
CREATE TABLE "site_social_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "workflow" TEXT NOT NULL DEFAULT 'approve',
    "post_days" INTEGER[] DEFAULT ARRAY[1, 3, 5]::INTEGER[],
    "post_time" TEXT NOT NULL DEFAULT '10:00',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "categories" TEXT[] DEFAULT ARRAY['educational', 'myths', 'storytelling']::TEXT[],
    "image_style" TEXT NOT NULL DEFAULT 'photo',
    "font_family" TEXT NOT NULL DEFAULT 'sans',
    "highlight_style" TEXT NOT NULL DEFAULT 'marker',
    "use_logo" BOOLEAN NOT NULL DEFAULT false,
    "show_brand_mark" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_social_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_social_settings_site_id_key" ON "site_social_settings"("site_id");

-- AddForeignKey
ALTER TABLE "site_social_settings" ADD CONSTRAINT "site_social_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_social_settings" ADD CONSTRAINT "site_social_settings_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
