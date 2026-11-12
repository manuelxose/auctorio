// R1 planning workspace: plan extension slots, brief building from edited items,
// item PATCH persistence + URL inventory guard, plan archive, presets and site planning defaults.

import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import {
  buildExtensionSlotRequest,
  buildProjectInputFromPlanItem,
  enqueueExtendPlan,
  readGenerationSettings,
  updateEditorialPlan,
  updateEditorialPlanItem,
} from "../src/studio/editorial-plan";
import { computePlanSlots } from "../src/studio/plan-slots";
import {
  createPlanPreset,
  deletePlanPreset,
  getSitePlanningSettings,
  listPlanPresets,
  normalizePlanningSettings,
  putSitePlanningSettings,
  updatePlanPreset,
  validatePresetPayload,
} from "../src/studio/planning-settings";

const prisma = getPrismaClient();
const NOW = new Date("2026-01-01T00:00:00.000Z");

async function fixture() {
  const seed = `plan-ws-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-k`), status: "active" } });
  const site = await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: "Site", type: "webhook", baseUrl: "https://site.test" } });
  await prisma.siteIndexedPage.create({ data: { tenantId: tenant.id, siteId: site.id, url: "https://site.test/indexed", title: "Indexed page", crawlState: "extracted" } });
  const plan = await prisma.editorialPlan.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      name: "Plan",
      status: "ready",
      dateFrom: new Date("2026-11-15T23:00:00.000Z"),
      dateTo: new Date("2026-11-22T22:59:59.999Z"),
      timezone: "Europe/Madrid",
      channels: ["website"],
      configuration: { cadence: { dateFrom: "2026-11-16", dateTo: "2026-11-22", timezone: "Europe/Madrid", articlesPerDay: 1 } },
    },
  });
  const item = await prisma.editorialPlanItem.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      siteId: site.id,
      title: "Original",
      channel: "website",
      scheduledFor: new Date("2026-11-16T08:00:00.000Z"),
      suggestedInternalLinks: ["https://site.test/already-linked"],
    },
  });
  return { tenantId: tenant.id, siteId: site.id, planId: plan.id, itemId: item.id };
}

test("EXT-01: extension slots start the day after the plan's local end and reuse the stored cadence", () => {
  const plan = {
    dateTo: new Date("2026-11-22T22:59:59.999Z"),
    timezone: "Europe/Madrid",
    configuration: { cadence: { articlesPerDay: 2, weekdays: [1, 3, 5], publishTimes: ["10:00", "17:00"], weekdayQuotas: { "5": 1 } } },
  };
  const request = buildExtensionSlotRequest(plan, { dateTo: "2026-11-29" }, NOW);
  assert.equal(request.dateFrom, "2026-11-23");
  assert.deepEqual(request.weekdays, [1, 3, 5]);
  const slots = computePlanSlots(request);
  // Mon 23, Wed 25 (2 each) and Fri 27 (quota 1); nothing on or before the old end date.
  assert.deepEqual(slots.map((slot) => `${slot.localDate} ${slot.localTime}`), [
    "2026-11-23 10:00", "2026-11-23 17:00", "2026-11-25 10:00", "2026-11-25 17:00", "2026-11-27 10:00",
  ]);
  // An explicit cadence override drops the per-weekday quotas.
  assert.equal(computePlanSlots(buildExtensionSlotRequest(plan, { dateTo: "2026-11-29", articlesPerDay: 1 }, NOW)).length, 3);
});

test("EXT-02: extension rejects a dateTo not after the plan end and plans without a cadence", () => {
  const plan = { dateTo: new Date("2026-11-22T22:59:59.999Z"), timezone: "Europe/Madrid", configuration: {} };
  assert.throws(() => buildExtensionSlotRequest(plan, { dateTo: "2026-11-22", articlesPerDay: 1 }), /editorial_plan_extend_date_not_after_plan_end/);
  assert.throws(() => buildExtensionSlotRequest(plan, { dateTo: "2026-12-01" }), /editorial_plan_extend_cadence_required/);
});

test("BRIEF-01: edited fields and generation settings reach the project brief and metadata", () => {
  const input = buildProjectInputFromPlanItem(
    {
      id: "item-1", planId: "plan-1", siteId: "site-1", channel: "website", title: "Raw", workingTitle: "Working", finalSuggestedTitle: "Final headline",
      angle: null, topic: "Streaming", topicCluster: "TV", pillarPage: null, primaryIntent: "informational", searchIntent: "informational",
      secondaryIntents: ["comparison"], funnelStage: null, targetQuery: "mejores series", primaryKeyword: "series netflix",
      secondaryKeywords: ["series hbo", "estrenos"], semanticKeywords: null, relatedEntities: ["Netflix"], questionsToAnswer: ["¿Qué ver?"],
      audience: "Suscriptores de streaming en España", editorialObjective: null, competitorAngle: null,
      suggestedInternalLinks: ["https://site.test/indexed"], suggestedExternalEvidenceTypes: null, faqCandidates: [{ question: "q", answer: "a" }],
      schemaTypes: null, outline: [{ heading: "Intro", subpoints: ["Contexto"] }, { heading: "Lista" }], recommendedWordCountMin: 900,
      recommendedWordCountMax: 1400, cannibalizationRisk: null, seoTitle: "SEO title", metaDescription: "Meta", suggestedSlug: null,
      freshnessRequirement: null, imageConcept: "Collage de posters", contentType: "ranking",
      sourceEvidence: [{ title: "Indexed page", url: "https://site.test/indexed" }], notes: "Evitar spoilers",
      metadata: { generation: { tone: "cercano", includeFaq: false, includeImage: false, instructions: "Citar fuentes", bogus: 1 } },
    },
    { language: "en" },
  );
  assert.equal(input.title, "Final headline");
  assert.equal(input.primaryLanguage, "en");
  for (const fragment of [
    "Keywords secundarias: series hbo, estrenos",
    "Audiencia: Suscriptores de streaming en España",
    "1. Intro\n   - Contexto",
    "Evidencias (no inventes datos fuera de ellas):\n- Indexed page (https://site.test/indexed)",
    "Tono: cercano",
    "Incluir seccion FAQ: no",
    "Imagen destacada: no",
    "Instrucciones adicionales: Citar fuentes",
    "Notas del editor: Evitar spoilers",
    "Extension objetivo: 900-1400 palabras",
  ]) {
    assert.ok(input.brief.includes(fragment), `brief is missing: ${fragment}`);
  }
  assert.ok(!input.brief.includes("Concepto de imagen"), "image concept is dropped when the editor turned images off");
  const metadata = input.metadata as Record<string, unknown>;
  assert.deepEqual(metadata.secondaryKeywords, ["series hbo", "estrenos"]);
  assert.equal(metadata.audience, "Suscriptores de streaming en España");
  assert.deepEqual(metadata.faqCandidates, []);
  assert.deepEqual(metadata.generation, { tone: "cercano", includeFaq: false, includeImage: false, instructions: "Citar fuentes" });
  assert.deepEqual(readGenerationSettings({ generation: "nope" }), {});
});

test("ITEM-01: PATCH persists the full brief and keeps unspecified fields (scheduledFor)", async () => {
  const { tenantId, itemId } = await fixture();
  const updated = await updateEditorialPlanItem(tenantId, itemId, {
    secondaryKeywords: ["a", "b"],
    audience: "Editores",
    relatedEntities: ["Entity"],
    outline: [{ heading: "H1", subpoints: ["p"] }],
    suggestedInternalLinks: ["https://site.test/already-linked", "https://site.test/indexed"],
    sourceEvidence: [{ title: "Indexed page", url: "https://site.test/indexed" }],
    generation: { tone: "formal", includeFaq: true, includeImage: false, instructions: null },
    notes: "note",
  });
  assert.ok(updated);
  assert.deepEqual(updated.secondaryKeywords, ["a", "b"]);
  assert.equal(updated.audience, "Editores");
  assert.equal(updated.scheduledFor?.toISOString(), "2026-11-16T08:00:00.000Z");
  assert.deepEqual((updated.metadata as Record<string, unknown>).generation, { tone: "formal", includeFaq: true, includeImage: false, instructions: null });
  // Clearing generation settings removes them.
  const cleared = await updateEditorialPlanItem(tenantId, itemId, { generation: null });
  assert.equal((cleared?.metadata as Record<string, unknown>).generation, undefined);
});

test("ITEM-02: new internal links and evidence outside the site inventory are rejected", async () => {
  const { tenantId, itemId } = await fixture();
  await assert.rejects(
    updateEditorialPlanItem(tenantId, itemId, { suggestedInternalLinks: ["https://evil.test/x"] }),
    /editorial_plan_item_url_not_in_inventory: https:\/\/evil.test\/x/,
  );
  await assert.rejects(
    updateEditorialPlanItem(tenantId, itemId, { sourceEvidence: [{ title: "Made up", url: "https://made-up.test" }] }),
    /editorial_plan_item_url_not_in_inventory/,
  );
  // Evidence without a URL (a described evidence type) is allowed.
  const ok = await updateEditorialPlanItem(tenantId, itemId, { sourceEvidence: [{ title: "Official schedule" }] });
  assert.deepEqual(ok?.sourceEvidence, [{ title: "Official schedule" }]);
});

test("PLAN-ARCHIVE: archiving hides nothing else and is refused while generating; extension validates first", async () => {
  const { tenantId, planId } = await fixture();
  await assert.rejects(enqueueExtendPlan(tenantId, planId, { dateTo: "2026-11-20" }), /editorial_plan_extend_date_not_after_plan_end/);
  await prisma.editorialPlan.update({ where: { id: planId }, data: { status: "generating" } });
  await assert.rejects(updateEditorialPlan(tenantId, planId, { status: "archived" }), /editorial_plan_busy/);
  await prisma.editorialPlan.update({ where: { id: planId }, data: { status: "ready" } });
  const archived = await updateEditorialPlan(tenantId, planId, { status: "archived", name: "Renamed" });
  assert.equal(archived?.status, "archived");
  assert.equal(archived?.name, "Renamed");
  assert.equal(await updateEditorialPlan(tenantId, "00000000-0000-0000-0000-000000000000", { status: "archived" }), null);
});

test("PRESETS: CRUD scoped to tenant; site presets include tenant-wide ones", async () => {
  const { tenantId, siteId } = await fixture();
  assert.throws(() => validatePresetPayload([1]), /preset_payload_must_be_object/);
  assert.throws(() => validatePresetPayload({ blob: "x".repeat(20_000) }), /preset_payload_too_large/);
  const global = await createPlanPreset(tenantId, { name: "Global", payload: { articlesPerDay: 1 } });
  const local = await createPlanPreset(tenantId, { name: "Local", siteId, payload: { strategyMode: "seo-growth" } });
  assert.deepEqual((await listPlanPresets(tenantId, siteId)).map((preset) => preset.name), ["Global", "Local"]);
  const renamed = await updatePlanPreset(tenantId, local.id, { name: "Local 2", payload: { strategyMode: "seasonal" } });
  assert.deepEqual(renamed?.payload, { strategyMode: "seasonal" });
  assert.deepEqual(await deletePlanPreset(tenantId, global.id), { ok: true });
  assert.equal(await deletePlanPreset(tenantId, global.id), null);
});

test("SETTINGS: defaults, validation and persistence including the site timezone", async () => {
  const { tenantId, siteId } = await fixture();
  const defaults = await getSitePlanningSettings(tenantId, siteId);
  assert.equal(defaults.timezone, "Europe/Madrid");
  assert.equal(defaults.persisted, false);
  assert.throws(() => normalizePlanningSettings({ timezone: "Mars/Base" }), /planning_settings_invalid_timezone/);
  assert.throws(() => normalizePlanningSettings({ publishTimes: ["25:00"] }), /planning_settings_invalid_publish_times/);
  assert.throws(() => normalizePlanningSettings({ weekdays: [] }), /planning_settings_invalid_weekdays/);
  const preset = await createPlanPreset(tenantId, { name: "Default", siteId, payload: {} });
  const saved = await putSitePlanningSettings(tenantId, siteId, {
    timezone: "America/Mexico_City",
    articlesPerDay: 2,
    weekdays: [5, 1, 1],
    publishTimes: ["18:00", "09:30"],
    channels: ["website", "x"],
    defaultPresetId: preset.id,
  });
  assert.equal(saved.timezone, "America/Mexico_City");
  assert.deepEqual(saved.weekdays, [1, 5]);
  assert.deepEqual(saved.publishTimes, ["09:30", "18:00"]);
  assert.equal(saved.defaultPresetId, preset.id);
  assert.equal(saved.persisted, true);
  // Partial update keeps the rest.
  const partial = await putSitePlanningSettings(tenantId, siteId, { articlesPerDay: 3 });
  assert.deepEqual(partial.channels, ["website", "x"]);
  assert.equal(partial.articlesPerDay, 3);
  await assert.rejects(putSitePlanningSettings(tenantId, siteId, { defaultPresetId: "00000000-0000-0000-0000-000000000000" }), /planning_settings_preset_not_found/);
});
