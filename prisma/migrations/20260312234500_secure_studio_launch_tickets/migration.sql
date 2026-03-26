CREATE TABLE "studio_launch_tickets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "studio_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "requested_email" TEXT NOT NULL,
    "requested_display_name" TEXT,
    "source_app" TEXT NOT NULL,
    "return_to" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_launch_tickets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "studio_launch_tickets_token_hash_key" ON "studio_launch_tickets"("token_hash");
CREATE UNIQUE INDEX "studio_launch_tickets_jti_key" ON "studio_launch_tickets"("jti");
CREATE INDEX "studio_launch_tickets_tenant_id_studio_user_id_consumed_at_idx" ON "studio_launch_tickets"("tenant_id", "studio_user_id", "consumed_at");
CREATE INDEX "studio_launch_tickets_expires_at_idx" ON "studio_launch_tickets"("expires_at");

ALTER TABLE "studio_launch_tickets"
ADD CONSTRAINT "studio_launch_tickets_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "studio_launch_tickets"
ADD CONSTRAINT "studio_launch_tickets_studio_user_id_fkey"
FOREIGN KEY ("studio_user_id") REFERENCES "studio_users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
