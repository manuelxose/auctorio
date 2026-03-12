import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../src/infrastructure/db/prisma";

type TenantDefinition = {
  tenantName: string;
  site: {
    key: string;
    name: string;
    type: "guiatv" | "tecnoria" | "talkaris";
    locale: string;
    baseUrl: string;
    publishingCredentialsRef: string;
    brandVoice: Record<string, unknown>;
    seoRules: Record<string, unknown>;
    taxonomyMap: Record<string, unknown>;
  };
};

function asJson(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

const TENANTS: TenantDefinition[] = [
  {
    tenantName: "tecnoria",
    site: {
      key: "tecnoria-main",
      name: "Tecnoria",
      type: "tecnoria",
      locale: "es-ES",
      baseUrl: "https://tecnoriasl.com",
      publishingCredentialsRef: "TECNORIA_AUCTORIO_TOKEN",
      brandVoice: {
        tone: "B2B, direct, pragmatic",
        audience: "technology buyers and operations leaders",
      },
      seoRules: {
        focus: ["software development", "automation", "AI operations"],
        defaultAuthor: "Tecnoria",
      },
      taxonomyMap: {
        tags: ["software a medida", "automatizacion", "ia aplicada"],
      },
    },
  },
  {
    tenantName: "guiaprogramaciontv",
    site: {
      key: "guiatv-editorial",
      name: "Guia de Programacion TV",
      type: "guiatv",
      locale: "es-ES",
      baseUrl: "https://guiaprogramaciontv.com",
      publishingCredentialsRef: "GUIATV_AUCTORIO_ADMIN_KEY",
      brandVoice: {
        tone: "editorial, useful, search-led",
        audience: "TV and streaming discovery readers",
      },
      seoRules: {
        focus: ["programacion tv", "streaming", "series", "peliculas"],
        defaultContentType: "guide",
      },
      taxonomyMap: {
        contentTypes: ["guide", "ranking", "news", "faq"],
      },
    },
  },
  {
    tenantName: "talkaris",
    site: {
      key: "talkaris-blog",
      name: "Talkaris",
      type: "talkaris",
      locale: "en",
      baseUrl: "https://talkaris.com",
      publishingCredentialsRef: "TALKARIS_AUCTORIO_TOKEN",
      brandVoice: {
        tone: "product-led, technical, credible",
        audience: "product teams and operations leaders",
      },
      seoRules: {
        focus: ["ai chat platform", "knowledge operations", "chatbot governance"],
        defaultAuthor: "Talkaris Team",
      },
      taxonomyMap: {
        categories: ["features", "integrations", "use-cases", "product-updates"],
      },
    },
  },
];

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

async function main() {
  const prisma = getPrismaClient();
  const output: Array<{
    tenantId: string;
    tenantName: string;
    apiKey?: string;
    siteId: string;
    siteKey: string;
  }> = [];

  for (const definition of TENANTS) {
    let issuedApiKey: string | undefined;
    const existingTenant = await prisma.tenant.findUnique({
      where: { name: definition.tenantName },
    });

    const tenant = existingTenant
      ? existingTenant
      : await prisma.tenant.create({
          data: {
            name: definition.tenantName,
            apiKeyHash: hashApiKey((issuedApiKey = randomBytes(24).toString("hex"))),
            status: "active",
          },
        });

    const site = await prisma.site.upsert({
      where: {
        tenantId_key: {
          tenantId: tenant.id,
          key: definition.site.key,
        },
      },
      update: {
        name: definition.site.name,
        type: definition.site.type,
        locale: definition.site.locale,
        baseUrl: definition.site.baseUrl,
        publishingCredentialsRef: definition.site.publishingCredentialsRef,
        brandVoice: asJson(definition.site.brandVoice),
        seoRules: asJson(definition.site.seoRules),
        taxonomyMap: asJson(definition.site.taxonomyMap),
      },
      create: {
        tenantId: tenant.id,
        key: definition.site.key,
        name: definition.site.name,
        type: definition.site.type,
        locale: definition.site.locale,
        baseUrl: definition.site.baseUrl,
        publishingCredentialsRef: definition.site.publishingCredentialsRef,
        brandVoice: asJson(definition.site.brandVoice),
        seoRules: asJson(definition.site.seoRules),
        taxonomyMap: asJson(definition.site.taxonomyMap),
      },
    });

    output.push({
      tenantId: tenant.id,
      tenantName: tenant.name,
      ...(issuedApiKey ? { apiKey: issuedApiKey } : {}),
      siteId: site.id,
      siteKey: site.key,
    });
  }

  console.log(JSON.stringify({ tenants: output }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
