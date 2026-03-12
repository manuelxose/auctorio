"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const prisma_1 = require("../src/infrastructure/db/prisma");
function hashApiKey(apiKey) {
    return (0, crypto_1.createHash)("sha256").update(apiKey).digest("hex");
}
async function main() {
    const [name] = process.argv.slice(2);
    if (!name) {
        console.error("Usage: ts-node scripts/create-tenant.ts <tenant-name>");
        process.exit(1);
    }
    const prisma = (0, prisma_1.getPrismaClient)();
    const apiKey = (0, crypto_1.randomBytes)(24).toString("hex");
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
