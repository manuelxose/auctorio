import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../src/infrastructure/db/prisma";

// ─────────────────────────────────────────────────────────────────────────────
// Parameter-driven tenant/site provisioning.
//
// This script provisions ONLY the tenants/sites the operator explicitly asks
// for via arguments (or an opt-in development fixture set via --fixtures).
// No real brand or domain is provisioned merely by running bootstrap/deploy
// commands. Example:
//
//   node dist/scripts/provision-linked-tenants.js \
//     --tenant my-tenant --site-key my-site --site-name "My Site" \
//     --site-type webhook --locale es-ES --base-url https://example.com \
//     --credentials-ref MY_SITE_TOKEN
//
// Opt-in development fixtures (fictitious domains only):
//   node dist/scripts/provision-linked-tenants.js --fixtures
// ─────────────────────────────────────────────────────────────────────────────

type ProvisionArgs = {
  tenant?: string;
  siteKey?: string;
  siteName?: string;
  siteType?: "guiatv" | "tecnoria" | "talkaris" | "webhook" | "generic_rest";
  locale?: string;
  baseUrl?: string;
  credentialsRef?: string;
  fixtures?: boolean;
};

const FIXTURE_SITES: Array<{
  tenantName: string;
  siteKey: string;
  siteName: string;
  siteType: "webhook" | "generic_rest";
  locale: string;
  baseUrl: string;
  credentialsRef: string;
}> = [
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

function asJson(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

function parseArgs(): ProvisionArgs {
  const args: ProvisionArgs = {};
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
        } else {
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

async function provision(input: {
  tenantName: string;
  siteKey: string;
  siteName: string;
  siteType: NonNullable<ProvisionArgs["siteType"]>;
  locale: string;
  baseUrl: string;
  credentialsRef: string;
}) {
  const prisma = getPrismaClient();
  let issuedApiKey: string | undefined;
  const existingTenant = await prisma.tenant.findUnique({ where: { name: input.tenantName } });
  const tenant = existingTenant
    ? existingTenant
    : await prisma.tenant.create({
        data: {
          name: input.tenantName,
          apiKeyHash: hashApiKey((issuedApiKey = randomBytes(24).toString("hex"))),
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
  const prisma = getPrismaClient();
  const output: Array<Record<string, unknown>> = [];

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
    const required = ["siteKey", "siteName", "siteType", "locale", "baseUrl", "credentialsRef"] as const;
    const missing = required.filter((key) => !args[key]);
    if (missing.length > 0) {
      console.error(`missing required flags for --tenant: ${missing.map((key) => `--${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`).join(" ")}`);
      process.exit(2);
    }
    output.push(
      await provision({
        tenantName: args.tenant,
        siteKey: args.siteKey!,
        siteName: args.siteName!,
        siteType: args.siteType!,
        locale: args.locale!,
        baseUrl: args.baseUrl!,
        credentialsRef: args.credentialsRef!,
      }),
    );
  }

  console.log(JSON.stringify({ provisioned: output }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
