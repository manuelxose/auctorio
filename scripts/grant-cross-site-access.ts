/**
 * Grants one StudioAccount cross-site access to an additional tenant with a
 * simple role (admin|editor|viewer). Idempotent.
 *
 * Usage: npx ts-node scripts/grant-cross-site-access.ts <email> <tenantName> <roleKey>
 */
import { getPrismaClient } from "../src/infrastructure/db/prisma";

const ROLE_KEYS = ["admin", "editor", "viewer"] as const;

async function main() {
  const [email, tenantName, roleKey] = process.argv.slice(2);
  if (!email || !tenantName || !roleKey || !ROLE_KEYS.includes(roleKey as (typeof ROLE_KEYS)[number])) {
    console.error("usage: grant-cross-site-access.ts <email> <tenantName> <admin|editor|viewer>");
    process.exit(1);
  }

  const prisma = getPrismaClient();
  const account = await prisma.studioAccount.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!account) {
    console.error(`account not found: ${email}`);
    process.exit(1);
  }

  const tenant = await prisma.tenant.findFirst({ where: { name: tenantName } });
  if (!tenant) {
    console.error(`tenant not found: ${tenantName}`);
    process.exit(1);
  }

  const role = await prisma.studioRole.findUnique({
    where: { tenantId_key: { tenantId: tenant.id, key: roleKey } },
  });
  if (!role) {
    console.error(`role ${roleKey} not found in tenant ${tenantName}`);
    process.exit(1);
  }

  const existing = await prisma.studioUser.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: account.email } },
  });

  if (!existing) {
    const user = await prisma.studioUser.create({
      data: {
        tenantId: tenant.id,
        accountId: account.id,
        email: account.email,
        displayName: account.displayName || account.email,
        avatarUrl: account.avatarUrl,
        status: "active",
        roles: {
          create: [{ studioRoleId: role.id }],
        },
      },
    });
    console.log(`created membership: account=${account.email} tenant=${tenant.name} role=${roleKey} user=${user.id}`);
  } else {
    const roleLink = await prisma.studioUserRole.findUnique({
      where: {
        studioUserId_studioRoleId: {
          studioUserId: existing.id,
          studioRoleId: role.id,
        },
      },
    });
    if (!roleLink) {
      await prisma.studioUserRole.create({
        data: { studioUserId: existing.id, studioRoleId: role.id },
      });
    }
    await prisma.studioUser.update({
      where: { id: existing.id },
      data: { status: "active" },
    });
    console.log(`updated membership: account=${account.email} tenant=${tenant.name} role=${roleKey} user=${existing.id}`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
