"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const prisma_1 = require("../src/infrastructure/db/prisma");
const FIXTURE_SITES = [
    {
        // Fictitious development fixture — never a real brand.
        tenantName: "fixture-demo",
        siteKey: "fixture-demo-site",
        siteName: "Fixture Demo Site",
        siteType: "webhook",
        locale: "en",
        baseUrl: "https://fixture.example.test",
        credentialsRef: "FIXTURE_DEMO_WEBHOOK_SECRET",
    },
];
function asJson(value) {
    return value;
}
function hashApiKey(apiKey) {
    return (0, node_crypto_1.createHash)("sha256").update(apiKey).digest("hex");
}
function parseArgs() {
    const args = {};
    const raw = process.argv.slice(2);
    for (let index = 0; index < raw.length; index += 1) {
        const flag = raw[index];
        const next = raw[index + 1];
        switch (flag) {
            case "--tenant":
                args.tenant = next;
                index += 1;
                break;
            case "--site-key":
                args.siteKey = next;
                index += 1;
                break;
            case "--site-name":
                args.siteName = next;
                index += 1;
                break;
            case "--site-type":
                if (next === "guiatv" || next === "tecnoria" || next === "talkaris" || next === "webhook" || next === "generic_rest") {
                    args.siteType = next;
                }
                else {
                    console.error(`invalid --site-type ${next}`);
                    process.exit(2);
                }
                index += 1;
                break;
            case "--locale":
                args.locale = next;
                index += 1;
                break;
            case "--base-url":
                args.baseUrl = next;
                index += 1;
                break;
            case "--credentials-ref":
                args.credentialsRef = next;
                index += 1;
                break;
            case "--fixtures":
                args.fixtures = true;
                break;
            case "--help":
                console.log(`
Usage: provision-linked-tenants.js
  --tenant <name>            Tenant name (created if missing)
  --site-key <key>           Site key (unique per tenant)
  --site-name <name>         Human site name
  --site-type <type>         guiatv|tecnoria|talkaris|webhook|generic_rest
  --locale <locale>          e.g. es-ES
  --base-url <url>           Publishing base URL
  --credentials-ref <ref>    Environment variable holding the secret
  --fixtures                 Opt-in fictitious development fixtures only

No arguments does nothing. Real brands are never provisioned implicitly.
`);
                process.exit(0);
                break;
            default:
                console.error(`unknown flag ${flag}`);
                process.exit(2);
        }
    }
    return args;
}
async function provision(input) {
    const prisma = (0, prisma_1.getPrismaClient)();
    let issuedApiKey;
    const existingTenant = await prisma.tenant.findUnique({ where: { name: input.tenantName } });
    const tenant = existingTenant
        ? existingTenant
        : await prisma.tenant.create({
            data: {
                name: input.tenantName,
                apiKeyHash: hashApiKey((issuedApiKey = (0, node_crypto_1.randomBytes)(24).toString("hex"))),
                status: "active",
            },
        });
    const site = await prisma.site.upsert({
        where: { tenantId_key: { tenantId: tenant.id, key: input.siteKey } },
        update: {
            name: input.siteName,
            type: input.siteType,
            locale: input.locale,
            baseUrl: input.baseUrl,
            publishingCredentialsRef: input.credentialsRef,
            brandVoice: asJson({ tone: "neutral" }),
            seoRules: asJson({}),
            taxonomyMap: asJson({}),
        },
        create: {
            tenantId: tenant.id,
            key: input.siteKey,
            name: input.siteName,
            type: input.siteType,
            locale: input.locale,
            baseUrl: input.baseUrl,
            publishingCredentialsRef: input.credentialsRef,
            brandVoice: asJson({ tone: "neutral" }),
            seoRules: asJson({}),
            taxonomyMap: asJson({}),
        },
    });
    return { tenantId: tenant.id, tenantName: tenant.name, ...(issuedApiKey ? { apiKey: issuedApiKey } : {}), siteId: site.id, siteKey: site.key };
}
async function main() {
    const args = parseArgs();
    const prisma = (0, prisma_1.getPrismaClient)();
    const output = [];
    if (!args.tenant && !args.fixtures) {
        console.log("Nothing to provision. Pass --tenant … or --fixtures. See --help.");
        await prisma.$disconnect();
        return;
    }
    if (args.fixtures) {
        for (const fixture of FIXTURE_SITES) {
            output.push(await provision(fixture));
        }
    }
    if (args.tenant) {
        const required = ["siteKey", "siteName", "siteType", "locale", "baseUrl", "credentialsRef"];
        const missing = required.filter((key) => !args[key]);
        if (missing.length > 0) {
            console.error(`missing required flags for --tenant: ${missing.map((key) => `--${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`).join(" ")}`);
            process.exit(2);
        }
        output.push(await provision({
            tenantName: args.tenant,
            siteKey: args.siteKey,
            siteName: args.siteName,
            siteType: args.siteType,
            locale: args.locale,
            baseUrl: args.baseUrl,
            credentialsRef: args.credentialsRef,
        }));
    }
    console.log(JSON.stringify({ provisioned: output }, null, 2));
    await prisma.$disconnect();
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
