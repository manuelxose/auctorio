// Phase 6 — automation mode normalization and atomic policy semantics.
import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTOMATION_MODES,
  MODE_FLAGS,
  buildModePayload,
  deriveModeFromFlags,
  isConsistentPolicy,
  normalizeAutomationMode,
} from "../src/studio/automation-mode";
import {
  assertSafeAutomationPolicy,
  resolveModeUpdate,
  sanitizePolicyInput,
} from "../src/studio/automation";

test("automation modes are exactly manual, assisted, autopilot", () => {
  assert.deepEqual(AUTOMATION_MODES, ["manual", "assisted", "autopilot"]);
});

test("normalizeAutomationMode keeps valid modes and derives legacy ones", () => {
  assert.equal(normalizeAutomationMode("autopilot"), "autopilot");
  assert.equal(normalizeAutomationMode("assisted"), "assisted");
  assert.equal(normalizeAutomationMode("manual"), "manual");
  // Legacy rows: mode NULL but autoPublish on ⇒ autopilot semantics.
  assert.equal(normalizeAutomationMode(null, { autoGenerate: true, autoApprove: true, autoSchedule: true, autoPublish: true }), "autopilot");
  // Legacy rows: generation but no auto publish ⇒ assisted.
  assert.equal(normalizeAutomationMode(null, { autoGenerate: true, autoPublish: false }), "assisted");
  // Unknown string + no flags ⇒ manual.
  assert.equal(normalizeAutomationMode("weird-mode"), "manual");
});

test("deriveModeFromFlags mirrors legacy semantics", () => {
  assert.equal(deriveModeFromFlags(true, true, true, true), "autopilot");
  assert.equal(deriveModeFromFlags(true, false, true, false), "assisted");
  assert.equal(deriveModeFromFlags(false, false, false, false), "manual");
});

test("buildModePayload produces an internally consistent flag set per mode", () => {
  const autopilot = buildModePayload("autopilot");
  assert.deepEqual(autopilot.flags, {
    enabled: true,
    autoGenerate: true,
    autoRepair: true,
    autoApprove: true,
    autoSchedule: true,
    autoPublish: true,
  });
  assert.equal(autopilot.autopilot?.maxRepairAttempts, 4);

  const assisted = buildModePayload("assisted");
  assert.deepEqual(assisted.flags, {
    enabled: true,
    autoGenerate: true,
    autoRepair: true,
    autoApprove: false,
    autoSchedule: false,
    autoPublish: false,
  });
  assert.equal(assisted.autopilot, undefined);

  const manual = buildModePayload("manual");
  assert.deepEqual(manual.flags, {
    enabled: false,
    autoGenerate: false,
    autoRepair: false,
    autoApprove: false,
    autoSchedule: false,
    autoPublish: false,
  });

  // Overrides apply only to autopilot payload.
  const custom = buildModePayload("autopilot", { maxRepairAttempts: 6, autonomousQaThresholds: { overallQualityScore: 92 } });
  assert.equal(custom.autopilot?.maxRepairAttempts, 6);
  assert.deepEqual(custom.autopilot?.autonomousQaThresholds, { overallQualityScore: 92 });
});

test("every canonical mode flag set is consistent", () => {
  for (const mode of AUTOMATION_MODES) {
    assert.equal(isConsistentPolicy({ mode, ...MODE_FLAGS[mode] }), true);
  }
  // Contradictory partial state is detected.
  assert.equal(
    isConsistentPolicy({ mode: "autopilot", enabled: true, autoGenerate: false, autoRepair: true, autoApprove: true, autoSchedule: true, autoPublish: true }),
    false,
  );
});

test("resolveModeUpdate derives flags atomically from the mode", () => {
  const autopilot = resolveModeUpdate({ mode: "autopilot", maxRepairAttempts: 3 });
  assert.equal(autopilot.enabled, true);
  assert.equal(autopilot.autoGenerate, true);
  assert.equal(autopilot.autoRepair, true);
  assert.equal(autopilot.autoApprove, true);
  assert.equal(autopilot.autoSchedule, true);
  assert.equal(autopilot.autoPublish, true);
  assert.equal(autopilot.maxRepairAttempts, 3);

  const assisted = resolveModeUpdate({ mode: "assisted", autoApprove: true });
  // The mode wins: assisted can never auto-approve.
  assert.equal(assisted.autoApprove, false);
  assert.equal(assisted.autoPublish, false);
  assert.equal(assisted.autoSchedule, false);
  assert.equal(assisted.enabled, true);

  const manual = resolveModeUpdate({ mode: "manual" });
  assert.equal(manual.enabled, false);
  assert.equal(manual.autoGenerate, false);
  assert.equal(manual.autoPublish, false);
});

test("legacy flag updates without a mode stay untouched", () => {
  const input = { autoGenerate: true, autoSchedule: true };
  const resolved = resolveModeUpdate(input);
  assert.deepEqual(resolved, input);
});

test("unsafe legacy policies are rejected", () => {
  assert.throws(() => assertSafeAutomationPolicy({ autoPublish: true, autoGenerate: true, autoApprove: false, autoSchedule: true }), /auto_publish_requires/);
  assert.doesNotThrow(() => assertSafeAutomationPolicy({ autoPublish: true, autoGenerate: true, autoApprove: true, autoSchedule: true }));
  assert.doesNotThrow(() => assertSafeAutomationPolicy({ mode: "autopilot" }));
});

test("sanitizePolicyInput clamps limits and repair attempts", () => {
  const sanitized = sanitizePolicyInput({
    articlesPerDay: 500,
    xPostsPerDay: 999,
    minimumMinutesBetweenArticles: 1,
    minimumStoryScore: 7,
    maxRepairAttempts: 99,
  });
  assert.equal(sanitized.articlesPerDay, 20);
  assert.equal(sanitized.xPostsPerDay, 50);
  assert.equal(sanitized.minimumMinutesBetweenArticles, 15);
  assert.equal(sanitized.minimumStoryScore, 1);
  assert.ok((sanitized.maxRepairAttempts ?? 0) <= 10);
});
