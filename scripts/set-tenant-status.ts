import { getPrismaClient } from "../src/infrastructure/db/prisma";

const allowedStatuses = new Set(["active", "suspended"]);

type TenantStatus = "active" | "suspended";

async function main() {
  const [tenantIdOrName, statusArg] = process.argv.slice(2);
  if (!tenantIdOrName || !statusArg) {
    console.error("Usage: ts-node scripts/set-tenant-status.ts <tenant-id-or-name> <active|suspended>");
    process.exit(1);
  }

  if (!allowedStatuses.has(statusArg)) {
    console.error("Invalid status. Use 'active' or 'suspended'.");
    process.exit(1);
  }

  const status = statusArg as TenantStatus;
  const prisma = getPrismaClient();

  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [{ id: tenantIdOrName }, { name: tenantIdOrName }],
    },
  });

  if (!tenant) {
    console.error("Tenant not found");
    process.exit(1);
  }

  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: { status },
  });

  console.log(
    JSON.stringify({
      tenant_id: updated.id,
      name: updated.name,
      status: updated.status,
    }),
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
