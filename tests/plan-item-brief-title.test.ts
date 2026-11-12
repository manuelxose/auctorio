import assert from "node:assert/strict";
import test from "node:test";
import type { EditorialPlanItem } from "@prisma/client";
import { planItemBriefText } from "../src/studio/production/plan-item";

test("the brief title follows the same headline precedence as the Studio (final, working, title)", () => {
  const item = { title: "t", workingTitle: "working", finalSuggestedTitle: "edited headline", outline: null } as unknown as EditorialPlanItem;
  assert.match(planItemBriefText(item), /^Titulo: edited headline/);
  assert.match(planItemBriefText({ ...item, finalSuggestedTitle: null }), /^Titulo: working/);
});
