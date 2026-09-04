import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { inviteStudioUser } from "../src/studio/auth";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = "manuelxgon@gmail.com";

  let tenant = await prisma.tenant.findFirst({ where: { slug: "auctorio" } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: "Auctorio",
        slug: "auctorio",
        apiKeyHash: crypto.randomBytes(32).toString("hex"),
        status: "active",
      },
    });
    console.log(`tenant created: ${tenant.slug} (${tenant.id})`);
  } else {
    console.log(`tenant found: ${tenant.slug} (${tenant.id})`);
  }

  const invitation = await inviteStudioUser(tenant.id, null, {
    email,
    displayName: "Manuel Xose",
    roleKeys: ["owner", "admin"],
  });
  console.log(`user upserted: ${invitation.userId} roles=owner,admin`);

  await prisma.studioAccount.update({
    where: { email },
    data: { status: "active", emailVerifiedAt: new Date() },
  });
  await prisma.studioUser.updateMany({
    where: { tenantId: tenant.id, email },
    data: { status: "active" },
  });
  console.log("account + studio user marked active");

  const roles = await prisma.studioUserRole.findMany({
    where: { user: { tenantId: tenant.id, email } },
    include: { role: { select: { key: true } } },
  });
  console.log("assigned roles:", roles.map((r) => r.role.key).join(","));
}

main()
  .catch((error) => {
    console.error("grant failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
