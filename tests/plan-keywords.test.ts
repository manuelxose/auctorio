import test from "node:test";
import assert from "node:assert/strict";
import { screenKeywords } from "../src/studio/plan-keywords";

const context = {
  profile: null,
  site: { id: "s", name: "GuíaTV", type: "guiatv", baseUrl: null, locale: "es" },
  existingPlanQueries: ["donde ver la champions"],
  existingPlanTitles: ["Mejores plataformas de streaming en España"],
  searchTargets: [],
} as unknown as Parameters<typeof screenKeywords>[1];

test("keywords: keeps new on-topic ones, drops repeats, planned and off-topic", () => {
  const result = screenKeywords(
    ["series de netflix", "Series de  Netflix", "Dónde ver la Champions", "dónde ver la champions", "mejores plataformas streaming españa", "implantes dentales baratos", "  "],
    context,
  );
  assert.deepEqual(result.kept, ["series de netflix"]);
  assert.deepEqual(result.dropped.map((entry) => entry.reason), ["duplicate", "already_planned", "duplicate", "already_planned", "off_topic"]);
});
