import { createHash, randomBytes } from "crypto";
import { getPrismaClient } from "../src/infrastructure/db/prisma";

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

async function main() {
  const [name] = process.argv.slice(2);
  if (!name) {
    console.error("Usage: ts-node scripts/create-tenant.ts <tenant-name>");
    process.exit(1);
  }

  const prisma = getPrismaClient();
  const apiKey = randomBytes(24).toString("hex");
  const apiKeyHash = hashApiKey(apiKey);

  const tenant = await prisma.tenant.create({
    data: {
      name,
      apiKeyHash,
      status: "active",
    },
  });

  console.log(JSON.stringify({
    tenant_id: tenant.id,
    api_key: apiKey,
    note: "Store this API key securely; it is shown only once.",
  }));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
