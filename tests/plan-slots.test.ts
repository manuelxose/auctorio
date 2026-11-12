import test from "node:test";
import assert from "node:assert/strict";
import { computePlanSlots, computePlanSlotsDetailed, nextLocalDate, localDateInZone, planRangeBounds, zonedTimeToUtc } from "../src/studio/plan-slots";
import { assignBriefsToSlots, mergePlanBatches, topUpPlanItems, type PostValidationResult } from "../src/studio/editorial-plan";
import type { EditorialPlanBriefV2 } from "../src/studio/editorial-plan-schema";

// Fixed reference time so the suite does not depend on the wall clock.
const NOW = new Date("2026-01-01T00:00:00.000Z");

const madrid = (articlesPerDay: number, extra: Partial<Parameters<typeof computePlanSlots>[0]> = {}) =>
  computePlanSlots({ dateFrom: "2026-11-16", dateTo: "2026-11-22", timezone: "Europe/Madrid", articlesPerDay, now: NOW, ...extra });

function perDay(slots: ReturnType<typeof computePlanSlots>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const slot of slots) counts.set(slot.localDate, (counts.get(slot.localDate) ?? 0) + 1);
  return counts;
}

const briefs = (titles: string[]) =>
  titles.map((title) => ({ workingTitle: title, targetQuery: title.toLowerCase(), scheduledFor: "1999-01-01T00:00:00.000Z" }) as unknown as EditorialPlanBriefV2);

const result = (titles: string[]): PostValidationResult => ({ kept: briefs(titles), dropped: [], warnings: [] });

test("PLAN-01: seven eligible days at one proposal/day produce seven slots on seven distinct dates", () => {
  const slots = madrid(1);
  assert.equal(slots.length, 7);
  assert.deepEqual([...perDay(slots).values()], [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(slots[0].localDate, "2026-11-16");
  assert.equal(slots[6].localDate, "2026-11-22");
});

test("PLAN-01b: two per day produce 14 slots, two on every date", () => {
  const slots = madrid(2);
  assert.equal(slots.length, 14);
  assert.ok([...perDay(slots).values()].every((count) => count === 2));
});

test("PLAN-02: seven eligible days at three proposals/day produce 21 slots, three per date, distinct times", () => {
  const slots = madrid(3);
  assert.equal(slots.length, 21);
  assert.equal(perDay(slots).size, 7);
  assert.ok([...perDay(slots).values()].every((count) => count === 3));
  const firstDay = slots.filter((slot) => slot.localDate === "2026-11-16").map((slot) => slot.localTime);
  assert.deepEqual(firstDay, ["09:00", "13:00", "18:00"]);
  assert.equal(new Set(slots.map((slot) => slot.scheduledFor.toISOString())).size, 21);
});

test("PLAN-02b: 30 days at three per day produce 90 slots (no arbitrary 100-item horizon cut)", () => {
  const slots = computePlanSlots({ dateFrom: "2026-12-01", dateTo: "2026-12-30", timezone: "Europe/Madrid", articlesPerDay: 3, now: NOW });
  assert.equal(slots.length, 90);
});

test("PLAN-03: local times are converted with the right offset on both sides of the DST change", () => {
  // Europe/Madrid leaves summer time on 2026-10-25 at 03:00 local.
  const slots = computePlanSlots({ dateFrom: "2026-10-24", dateTo: "2026-10-26", timezone: "Europe/Madrid", articlesPerDay: 1, publishTimes: ["10:00"], now: NOW });
  assert.deepEqual(slots.map((slot) => slot.scheduledFor.toISOString()), [
    "2026-10-24T08:00:00.000Z", // CEST, UTC+2
    "2026-10-25T09:00:00.000Z", // CET, UTC+1
    "2026-10-26T09:00:00.000Z",
  ]);
  // Spring-forward gap: 02:30 does not exist on 2026-03-29, it must land on a real instant that day.
  const gap = zonedTimeToUtc("2026-03-29", "02:30", "Europe/Madrid");
  assert.equal(gap.toISOString().slice(0, 10), "2026-03-29");
});

test("PLAN-03b: month boundary, weekdays, per-weekday quotas and excluded dates", () => {
  const slots = computePlanSlots({
    dateFrom: "2026-11-28",
    dateTo: "2026-12-04",
    timezone: "Europe/Madrid",
    articlesPerDay: 2,
    weekdays: [1, 2, 3, 4, 5, 6], // no Sundays
    weekdayQuotas: { "6": 1 }, // Saturdays: one
    excludedDates: ["2026-12-02"],
    now: NOW,
  });
  assert.deepEqual(Object.fromEntries(perDay(slots)), {
    "2026-11-28": 1, // Saturday
    "2026-11-30": 2,
    "2026-12-01": 2,
    "2026-12-03": 2,
    "2026-12-04": 2,
  });
});

test("PLAN-03c: inclusive range bounds and invalid input", () => {
  const bounds = planRangeBounds("2026-11-16", "2026-11-22", "Europe/Madrid");
  assert.equal(bounds.from.toISOString(), "2026-11-15T23:00:00.000Z");
  assert.equal(bounds.to.toISOString(), "2026-11-22T22:59:59.999Z");
  assert.throws(() => madrid(1, { dateTo: "2026-11-01" }), /plan_slots_invalid_date_range/);
  assert.throws(() => madrid(1, { dateFrom: "2026-02-30" }), /plan_slots_invalid_date/);
  assert.throws(() => madrid(1, { timezone: "Mars/Olympus" }), /plan_slots_invalid_timezone/);
  assert.throws(() => computePlanSlots({ dateFrom: "2026-01-01", dateTo: "2026-12-31", timezone: "UTC", articlesPerDay: 3, now: NOW }), /plan_slots_too_many/);
});

test("PLAN-04: rejected candidates trigger bounded top-up until every slot is filled", async () => {
  const pool = [["Programacion television manana", "Estrenos Netflix noviembre"], ["Partidos Champions semana"], ["Peliculas clasicas sabado", "Documentales naturaleza"]];
  const calls: number[] = [];
  const { validated, rounds } = await topUpPlanItems(result(["Mejores series policiacas", "Canales deportes gratis"]), 7, async (missing) => {
    calls.push(missing);
    return result(pool.shift() ?? []);
  }, { perRound: 4, maxRounds: 3 });
  assert.equal(validated.kept.length, 7);
  assert.equal(rounds, 3);
  assert.deepEqual(calls, [4, 3, 2]);
});

test("PLAN-04b: top-up is bounded and the shortfall is reported per slot, never silently dropped", async () => {
  const slots = madrid(1);
  const { validated, rounds } = await topUpPlanItems(result(["Uno", "Dos", "Tres", "Cuatro"]), 7, async () => result([]), { maxRounds: 2 });
  assert.equal(rounds, 2);
  const assignment = assignBriefsToSlots(validated.kept, slots);
  assert.equal(assignment.items.length, 4);
  assert.deepEqual(assignment.unfilled.map((slot) => slot.localDate), ["2026-11-20", "2026-11-21", "2026-11-22"]);
  assert.ok(assignment.unfilled.every((slot) => slot.reason.length > 0));
});

test("PLAN-04c: provider failure (null batch) stops top-up immediately", async () => {
  let calls = 0;
  const { validated, rounds } = await topUpPlanItems(result(["Uno"]), 7, async () => { calls += 1; return null; });
  assert.equal(calls, 1);
  assert.equal(rounds, 1);
  assert.equal(validated.kept.length, 1);
});

test("slot assignment overrides the model's dates and merge drops cross-batch duplicates", () => {
  const slots = madrid(1);
  const merged = mergePlanBatches(result(["Mejores series de Netflix"]), result(["Mejores series de Netflix", "Partidos de LaLiga hoy"]), 7);
  assert.deepEqual(merged.kept.map((item) => item.workingTitle), ["Mejores series de Netflix", "Partidos de LaLiga hoy"]);
  assert.ok(merged.dropped.some((entry) => entry.reason.includes("duplicate")));
  const { items } = assignBriefsToSlots(merged.kept, slots);
  assert.deepEqual(items.map((item) => item.scheduledFor), [slots[0].scheduledFor.toISOString(), slots[1].scheduledFor.toISOString()]);
});

test("PLAN-03d: explicit empty weekdays and oversized ranges are rejected before any loop work", () => {
  assert.throws(() => madrid(1, { weekdays: [] }), /plan_slots_no_weekdays/);
  const started = Date.now();
  assert.throws(() => computePlanSlots({ dateFrom: "1000-01-01", dateTo: "9999-12-31", timezone: "UTC", articlesPerDay: 0 }), /plan_slots_range_too_long/);
  assert.ok(Date.now() - started < 200);
});

test("PLAN-04: slots already in the past (or inside the 30 min lead) are skipped and reported", () => {
  // now = 2026-11-16 09:40 Madrid (08:40Z): 09:00 is past, 11:05 local is 85 min ahead.
  const now = new Date("2026-11-16T08:40:00.000Z");
  const { slots, skippedPast } = computePlanSlotsDetailed({
    dateFrom: "2026-11-16",
    dateTo: "2026-11-17",
    timezone: "Europe/Madrid",
    articlesPerDay: 2,
    publishTimes: ["09:00", "11:05"],
    now,
  });
  assert.deepEqual(skippedPast.map((slot) => `${slot.localDate} ${slot.localTime}`), ["2026-11-16 09:00"]);
  assert.deepEqual(slots.map((slot) => `${slot.localDate} ${slot.localTime}`), ["2026-11-16 11:05", "2026-11-17 09:00", "2026-11-17 11:05"]);
  assert.deepEqual(slots.map((slot) => slot.index), [0, 1, 2]);
  // 10:15 local is 35 min ahead of now (outside the lead) but 10:05 is inside it.
  const lead = computePlanSlotsDetailed({ dateFrom: "2026-11-16", dateTo: "2026-11-16", timezone: "Europe/Madrid", articlesPerDay: 2, publishTimes: ["10:05", "10:15"], now });
  assert.deepEqual(lead.skippedPast.map((slot) => slot.localTime), ["10:05"]);
  assert.deepEqual(lead.slots.map((slot) => slot.localTime), ["10:15"]);
  // Default reference is the real clock: a range in the past yields nothing.
  assert.equal(computePlanSlots({ dateFrom: "2020-01-01", dateTo: "2020-01-07", timezone: "UTC", articlesPerDay: 1 }).length, 0);
});

test("PLAN-04b: local date helpers", () => {
  assert.equal(localDateInZone(new Date("2026-11-22T22:59:59.999Z"), "Europe/Madrid"), "2026-11-22");
  assert.equal(localDateInZone(new Date("2026-11-22T23:00:00.000Z"), "Europe/Madrid"), "2026-11-23");
  assert.equal(nextLocalDate("2026-12-31"), "2027-01-01");
});
