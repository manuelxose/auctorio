-- CreateEnum
CREATE TYPE "StudioIdentityProviderType" AS ENUM ('oidc');

-- CreateEnum
CREATE TYPE "StudioProvisioningMode" AS ENUM ('invite_only');

-- CreateEnum
CREATE TYPE "StudioUserStatus" AS ENUM ('invited', 'active', 'suspended');

-- CreateEnum
CREATE TYPE "StudioInvitationStatus" AS ENUM ('pending', 'accepted', 'revoked');

-- CreateEnum
CREATE TYPE "StudioPromptSurface" AS ENUM ('text_seo', 'text_instagram', 'image_contextual', 'image_independent');

-- CreateEnum
CREATE TYPE "StudioPromptScope" AS ENUM ('global', 'site');

-- CreateEnum
CREATE TYPE "StudioPromptVersionStatus" AS ENUM ('draft', 'approved', 'deprecated');

-- AlterTable
ALTER TABLE "ai_audit" ADD COLUMN     "prompt_preset_version_id" UUID;

-- AlterTable
ALTER TABLE "content_image" ADD COLUMN     "prompt_preset_version_id" UUID;

-- AlterTable
ALTER TABLE "content_text" ADD COLUMN     "prompt_preset_version_id" UUID;

-- AlterTable
ALTER TABLE "content_versions" ADD COLUMN     "approved_by_studio_user_id" UUID;

-- AlterTable
ALTER TABLE "publication_jobs" ADD COLUMN     "requested_by_studio_user_id" UUID;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "slug" TEXT;

-- CreateTable
CREATE TABLE "studio_identity_providers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "StudioIdentityProviderType" NOT NULL DEFAULT 'oidc',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "issuer" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret_ciphertext" TEXT,
    "scopes" TEXT NOT NULL DEFAULT 'openid profile email',
    "claim_mappings" JSONB,
    "provisioning_mode" "StudioProvisioningMode" NOT NULL DEFAULT 'invite_only',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_identity_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "status" "StudioUserStatus" NOT NULL DEFAULT 'invited',
    "oidc_subject" TEXT,
    "oidc_issuer" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_user_roles" (
    "id" UUID NOT NULL,
    "studio_user_id" UUID NOT NULL,
    "studio_role_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_invitations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "studio_user_id" UUID,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "status" "StudioInvitationStatus" NOT NULL DEFAULT 'pending',
    "token_hash" TEXT,
    "created_by_user_id" UUID,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_user_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "studio_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_prompt_presets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surface" "StudioPromptSurface" NOT NULL,
    "scope" "StudioPromptScope" NOT NULL DEFAULT 'global',
    "description" TEXT,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_prompt_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_prompt_versions" (
    "id" UUID NOT NULL,
    "preset_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "StudioPromptVersionStatus" NOT NULL DEFAULT 'draft',
    "system_template" TEXT,
    "user_template" TEXT NOT NULL,
    "variables_json" JSONB,
    "notes" TEXT,
    "created_by_user_id" UUID,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_prompt_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "site_id" UUID,
    "surface" "StudioPromptSurface" NOT NULL,
    "assignment_key" TEXT NOT NULL,
    "preset_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_prompt_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "studio_identity_providers_tenant_id_key" ON "studio_identity_providers"("tenant_id");

-- CreateIndex
CREATE INDEX "studio_users_tenant_id_status_idx" ON "studio_users"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "studio_users_tenant_id_oidc_issuer_oidc_subject_idx" ON "studio_users"("tenant_id", "oidc_issuer", "oidc_subject");

-- CreateIndex
CREATE UNIQUE INDEX "studio_users_tenant_id_email_key" ON "studio_users"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "studio_roles_tenant_id_key_key" ON "studio_roles"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "studio_role_permissions_role_id_permission_key" ON "studio_role_permissions"("role_id", "permission");

-- CreateIndex
CREATE INDEX "studio_user_roles_studio_role_id_idx" ON "studio_user_roles"("studio_role_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_user_roles_studio_user_id_studio_role_id_key" ON "studio_user_roles"("studio_user_id", "studio_role_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_invitations_token_hash_key" ON "studio_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "studio_invitations_tenant_id_email_status_idx" ON "studio_invitations"("tenant_id", "email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "studio_user_sessions_token_hash_key" ON "studio_user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "studio_user_sessions_tenant_id_studio_user_id_revoked_at_idx" ON "studio_user_sessions"("tenant_id", "studio_user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "studio_prompt_presets_tenant_id_surface_scope_site_id_idx" ON "studio_prompt_presets"("tenant_id", "surface", "scope", "site_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_prompt_presets_tenant_id_key_key" ON "studio_prompt_presets"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "studio_prompt_versions_status_idx" ON "studio_prompt_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "studio_prompt_versions_preset_id_version_number_key" ON "studio_prompt_versions"("preset_id", "version_number");

-- CreateIndex
CREATE INDEX "studio_prompt_assignments_tenant_id_site_id_surface_idx" ON "studio_prompt_assignments"("tenant_id", "site_id", "surface");

-- CreateIndex
CREATE UNIQUE INDEX "studio_prompt_assignments_tenant_id_surface_assignment_key_key" ON "studio_prompt_assignments"("tenant_id", "surface", "assignment_key");

-- CreateIndex
CREATE INDEX "ai_audit_tenant_id_prompt_preset_version_id_idx" ON "ai_audit"("tenant_id", "prompt_preset_version_id");

-- CreateIndex
CREATE INDEX "content_image_tenant_id_prompt_preset_version_id_idx" ON "content_image"("tenant_id", "prompt_preset_version_id");

-- CreateIndex
CREATE INDEX "content_text_tenant_id_prompt_preset_version_id_idx" ON "content_text"("tenant_id", "prompt_preset_version_id");

-- CreateIndex
CREATE INDEX "content_versions_tenant_id_approved_by_studio_user_id_idx" ON "content_versions"("tenant_id", "approved_by_studio_user_id");

-- CreateIndex
CREATE INDEX "publication_jobs_tenant_id_requested_by_studio_user_id_idx" ON "publication_jobs"("tenant_id", "requested_by_studio_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- AddForeignKey
ALTER TABLE "content_text" ADD CONSTRAINT "content_text_prompt_preset_version_id_fkey" FOREIGN KEY ("prompt_preset_version_id") REFERENCES "studio_prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_image" ADD CONSTRAINT "content_image_prompt_preset_version_id_fkey" FOREIGN KEY ("prompt_preset_version_id") REFERENCES "studio_prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_audit" ADD CONSTRAINT "ai_audit_prompt_preset_version_id_fkey" FOREIGN KEY ("prompt_preset_version_id") REFERENCES "studio_prompt_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_approved_by_studio_user_id_fkey" FOREIGN KEY ("approved_by_studio_user_id") REFERENCES "studio_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_jobs" ADD CONSTRAINT "publication_jobs_requested_by_studio_user_id_fkey" FOREIGN KEY ("requested_by_studio_user_id") REFERENCES "studio_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_identity_providers" ADD CONSTRAINT "studio_identity_providers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_users" ADD CONSTRAINT "studio_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_roles" ADD CONSTRAINT "studio_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_role_permissions" ADD CONSTRAINT "studio_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "studio_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_user_roles" ADD CONSTRAINT "studio_user_roles_studio_user_id_fkey" FOREIGN KEY ("studio_user_id") REFERENCES "studio_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_user_roles" ADD CONSTRAINT "studio_user_roles_studio_role_id_fkey" FOREIGN KEY ("studio_role_id") REFERENCES "studio_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_invitations" ADD CONSTRAINT "studio_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_invitations" ADD CONSTRAINT "studio_invitations_studio_user_id_fkey" FOREIGN KEY ("studio_user_id") REFERENCES "studio_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_invitations" ADD CONSTRAINT "studio_invitations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "studio_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_user_sessions" ADD CONSTRAINT "studio_user_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_user_sessions" ADD CONSTRAINT "studio_user_sessions_studio_user_id_fkey" FOREIGN KEY ("studio_user_id") REFERENCES "studio_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_prompt_presets" ADD CONSTRAINT "studio_prompt_presets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_prompt_presets" ADD CONSTRAINT "studio_prompt_presets_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_prompt_presets" ADD CONSTRAINT "studio_prompt_presets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "studio_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_prompt_presets" ADD CONSTRAINT "studio_prompt_presets_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "studio_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_prompt_versions" ADD CONSTRAINT "studio_prompt_versions_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "studio_prompt_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_prompt_versions" ADD CONSTRAINT "studio_prompt_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "studio_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_prompt_versions" ADD CONSTRAINT "studio_prompt_versions_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "studio_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_prompt_assignments" ADD CONSTRAINT "studio_prompt_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_prompt_assignments" ADD CONSTRAINT "studio_prompt_assignments_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_prompt_assignments" ADD CONSTRAINT "studio_prompt_assignments_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "studio_prompt_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_prompt_assignments" ADD CONSTRAINT "studio_prompt_assignments_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "studio_prompt_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_prompt_assignments" ADD CONSTRAINT "studio_prompt_assignments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "studio_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

