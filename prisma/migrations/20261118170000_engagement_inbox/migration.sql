CREATE TABLE "engagement_opportunities" (
  "id" UUID NOT NULL PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "site_id" UUID NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "platform" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "snippet" TEXT,
  "community" TEXT,
  "keyword" TEXT NOT NULL,
  "published_at" TIMESTAMP(3),
  "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'to_reply',
  "draft" TEXT
);

CREATE UNIQUE INDEX "engagement_opportunities_site_id_url_key" ON "engagement_opportunities"("site_id", "url");
CREATE INDEX "engagement_opportunity_inbox_idx" ON "engagement_opportunities"("tenant_id", "site_id", "platform", "status", "discovered_at");

CREATE TABLE "engagement_settings" (
  "id" UUID NOT NULL PRIMARY KEY,
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "site_id" UUID NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "platform" TEXT NOT NULL,
  "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "subreddits" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "reply_style" TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX "engagement_settings_site_id_platform_key" ON "engagement_settings"("site_id", "platform");
