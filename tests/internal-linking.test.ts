import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { suggestInternalLinks } from "../src/studio/internal-linking";

const prisma = getPrismaClient();

test.after(async () => {
  await prisma.$disconnect();
});

test("internal linking engine only suggests real indexed inventory URLs", async () => {
  const seed = `links-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" },
  });
  const site = await prisma.site.create({
    data: { tenantId: tenant.id, key: `${seed}-site`, name: "GuiaTV", type: "guiatv", baseUrl: "https://guiatv.example" },
  });

  try {
    await prisma.siteIndexedPage.createMany({
      data: [
        {
          tenantId: tenant.id,
          siteId: site.id,
          url: "https://guiatv.example/ranking/mejores-series-netflix",
          title: "Las mejores series de Netflix",
          contentType: "ranking",
          crawlState: "extracted",
          wordCount: 1500,
        },
        {
          tenantId: tenant.id,
          siteId: site.id,
          url: "https://guiatv.example/donde-ver/la-isla",
          title: "Dónde ver La Isla de las Tentaciones",
          contentType: "where-to-watch",
          crawlState: "extracted",
          wordCount: 1200,
        },
        {
          tenantId: tenant.id,
          siteId: site.id,
          url: "https://guiatv.example/comparativa/netflix-vs-max",
          title: "Comparativa Netflix vs Max",
          contentType: "comparison",
          crawlState: "extracted",
          wordCount: 900,
        },
      ],
    });

    const suggestions = await suggestInternalLinks(tenant.id, site.id, {
      keyword: "series netflix",
      topic: "streaming",
      limit: 5,
    });
    assert.ok(suggestions.length >= 1);
    assert.equal(suggestions[0].url, "https://guiatv.example/ranking/mejores-series-netflix");
    assert.ok(suggestions.every((suggestion) => suggestion.url.includes("guiatv.example")), "never invent URLs");
    assert.ok(suggestions.every((suggestion) => suggestion.anchor.length > 0));
    assert.ok(suggestions.every((suggestion) => suggestion.reason.length > 0));

    // Exclusion works.
    const excluded = await suggestInternalLinks(tenant.id, site.id, {
      keyword: "series netflix",
      excludeUrl: "https://guiatv.example/ranking/mejores-series-netflix",
    });
    assert.ok(excluded.every((suggestion) => suggestion.url !== "https://guiatv.example/ranking/mejores-series-netflix"));
  } finally {
    await prisma.siteIndexedPage.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.site.deleteMany({ where: { id: site.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }
});
