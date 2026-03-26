CREATE TYPE "StudioAccountStatus" AS ENUM ('invited', 'active', 'suspended');
CREATE TYPE "StudioAccountTokenKind" AS ENUM ('activation', 'password_reset');
CREATE TYPE "StudioSessionAuthMode" AS ENUM ('oidc', 'password', 'google', 'launch');

CREATE TABLE "studio_accounts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_subject" TEXT,
    "email_verified_at" TIMESTAMP(3),
    "last_workspace_id" UUID,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "status" "StudioAccountStatus" NOT NULL DEFAULT 'invited',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "studio_account_tokens" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "kind" "StudioAccountTokenKind" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_account_tokens_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "studio_users" ADD COLUMN "account_id" UUID;
ALTER TABLE "studio_user_sessions" ADD COLUMN "auth_mode" "StudioSessionAuthMode" NOT NULL DEFAULT 'oidc';

INSERT INTO "studio_accounts" (
    "id",
    "email",
    "email_verified_at",
    "last_workspace_id",
    "display_name",
    "avatar_url",
    "status",
    "created_at",
    "updated_at"
)
SELECT DISTINCT ON (trim(lower(su."email")))
    gen_random_uuid(),
    trim(lower(su."email")) AS normalized_email,
    CASE
        WHEN su."status" = 'active' OR su."oidc_issuer" IS NOT NULL THEN CURRENT_TIMESTAMP
        ELSE NULL
    END AS email_verified_at,
    su."tenant_id" AS last_workspace_id,
    su."display_name",
    su."avatar_url",
    CASE
        WHEN su."status" = 'suspended' THEN 'suspended'::"StudioAccountStatus"
        WHEN su."status" = 'active' THEN 'active'::"StudioAccountStatus"
        ELSE 'invited'::"StudioAccountStatus"
    END AS account_status,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "studio_users" AS su
ORDER BY
    trim(lower(su."email")),
    CASE
        WHEN su."status" = 'active' THEN 0
        WHEN su."status" = 'invited' THEN 1
        ELSE 2
    END,
    su."last_login_at" DESC NULLS LAST,
    su."updated_at" DESC;

UPDATE "studio_users" AS su
SET "account_id" = sa."id"
FROM "studio_accounts" AS sa
WHERE trim(lower(su."email")) = sa."email";

UPDATE "studio_users" AS su
SET "account_id" = (
    SELECT sa."id"
    FROM "studio_accounts" AS sa
    WHERE sa."email" = trim(lower(su."email"))
    LIMIT 1
)
WHERE su."account_id" IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "studio_users"
        WHERE "account_id" IS NULL
    ) THEN
        RAISE EXCEPTION 'studio_users.account_id backfill failed';
    END IF;
END
$$;

ALTER TABLE "studio_users" ALTER COLUMN "account_id" SET NOT NULL;

CREATE UNIQUE INDEX "studio_accounts_email_key" ON "studio_accounts"("email");
CREATE UNIQUE INDEX "studio_accounts_google_subject_key" ON "studio_accounts"("google_subject");
CREATE INDEX "studio_accounts_status_idx" ON "studio_accounts"("status");
CREATE UNIQUE INDEX "studio_account_tokens_token_hash_key" ON "studio_account_tokens"("token_hash");
CREATE INDEX "studio_account_tokens_account_id_kind_consumed_at_idx" ON "studio_account_tokens"("account_id", "kind", "consumed_at");
CREATE INDEX "studio_account_tokens_expires_at_idx" ON "studio_account_tokens"("expires_at");
CREATE INDEX "studio_users_account_id_idx" ON "studio_users"("account_id");

ALTER TABLE "studio_accounts"
ADD CONSTRAINT "studio_accounts_last_workspace_id_fkey"
FOREIGN KEY ("last_workspace_id") REFERENCES "tenants"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "studio_account_tokens"
ADD CONSTRAINT "studio_account_tokens_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "studio_accounts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "studio_users"
ADD CONSTRAINT "studio_users_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "studio_accounts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
