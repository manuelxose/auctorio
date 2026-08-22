import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { hashStudioPassword } from "../src/studio/passwords";
import { resolveTenantBySlug } from "../src/studio/auth";

/**
 * Provisions a dedicated Studio account for local visual QA.
 *
 * Usage:
 *   ts-node scripts/qa-visual-login.ts <email> <password> [tenant-slug]
 *
 * The account is created (or updated) with a password hash, an active membership
 * in the target tenant, and the admin role. It never touches existing accounts.
 * The password is passed as an argument and is never written to disk.
 */
async function main(): Promise<void> {
  const [email, password, slug = "guiaprogramaciontv"] = process.argv.slice(2);
  if (!email || !password) {
    throw new Error("Usage: ts-node scripts/qa-visual-login.ts <email> <password> [tenant-slug]");
  }
  if (password.trim().length < 10) {
    throw new Error("Password must be at least 10 characters.");
  }

  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) {
    throw new Error(`Tenant not found: ${slug}`);
  }

  const prisma = getPrismaClient();
  const passwordHash = await hashStudioPassword(password);

  const account = await prisma.studioAccount.upsert({
    where: { email: email.trim().toLowerCase() },
    create: {
      email: email.trim().toLowerCase(),
      displayName: "QA Visual",
      passwordHash,
      status: "active",
    },
    update: {
      passwordHash,
      status: "active",
    },
  });

  const user = await prisma.studioUser.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: account.email } },
    create: {
      tenantId: tenant.id,
      accountId: account.id,
      email: account.email,
      displayName: account.displayName ?? "QA Visual",
      status: "active",
    },
    update: {
      status: "active",
    },
  });

  const adminRole = await prisma.studioRole.findUnique({
    where: { tenantId_key: { tenantId: tenant.id, key: "admin" } },
  });
  if (!adminRole) {
    throw new Error(`No admin role in tenant ${slug}`);
  }

  await prisma.studioUserRole.upsert({
    where: {
      studioUserId_studioRoleId: { studioUserId: user.id, studioRoleId: adminRole.id },
    },
    create: { studioUserId: user.id, studioRoleId: adminRole.id },
    update: {},
  });

  console.log(
    JSON.stringify({
      ok: true,
      email: account.email,
      tenant: tenant.slug,
      role: "admin",
      note: "Account ready for Studio password login.",
    }),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("[qa-visual-login] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
