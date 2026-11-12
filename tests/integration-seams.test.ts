// Integration seams: source-registry evidence feeds planning, onboarding steps are registered.
import assert from "node:assert/strict";
import test from "node:test";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { buildEditorialPlanningContext } from "../src/studio/editorial-plan-context";
import { getOnboardingStep } from "../src/studio/onboarding/contracts";
import "../src/studio/onboarding/orchestrator";

const prisma = getPrismaClient();

test("onboarding orchestrator import chain registers the sources and competitors steps", () => {
  assert.ok(getOnboardingStep("sources"));
  assert.ok(getOnboardingStep("competitors"));
});

test("planning evidence includes items of active sources and not of paused ones", async () => {
  const seed = `seam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-k`), status: "active" } });
  const site = await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: seed, type: "guiatv", baseUrl: "https://seam.example" } });
  const mk = (name: string, enabled: boolean) =>
    prisma.contentSource.create({ data: { tenantId: tenant.id, siteId: site.id, name, type: "rss", url: `https://${name}.example/feed`, enabled, lastSuccessAt: new Date() } });
  const active = await mk(`${seed}-on`, true);
  const paused = await mk(`${seed}-off`, false);
  const item = (sourceId: string, slug: string) => ({ tenantId: tenant.id, sourceId, externalId: slug, title: slug, canonicalUrl: `https://${slug}.example/post`, contentHash: slug, publishedAt: new Date() });
  await prisma.sourceItem.createMany({ data: [item(active.id, "active-item"), item(paused.id, "paused-item")] });

  const context = await buildEditorialPlanningContext(tenant.id, site.id);
  const urls = context.evidence.map((entry) => entry.url);
  assert.ok(urls.includes("https://active-item.example/post"));
  assert.ok(!urls.includes("https://paused-item.example/post"));
  assert.ok(context.evidence.some((entry) => entry.sourceType === "source_item"));
});
