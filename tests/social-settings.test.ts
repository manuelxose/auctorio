import test from "node:test";
import assert from "node:assert/strict";
import { SOCIAL_SETTINGS_DEFAULTS, nextSocialSlot, validateSocialSettings } from "../src/studio/social-settings";
import { validateFacebookPayload, validateInstagramPayload } from "../src/studio/social-provider";

test("social settings: defaults pass their own validation", () => {
  assert.deepEqual(validateSocialSettings(SOCIAL_SETTINGS_DEFAULTS), SOCIAL_SETTINGS_DEFAULTS);
});

test("social settings: days are deduped and sorted", () => {
  assert.deepEqual(validateSocialSettings({ postDays: [5, 1, 5, 0] }).postDays, [0, 1, 5]);
});

test("social settings: rejects invalid values", () => {
  const bad: Array<[Record<string, unknown>, string]> = [
    [{ workflow: "yolo" }, "invalid_workflow"],
    [{ postDays: [] }, "invalid_postDays"],
    [{ postDays: [7] }, "invalid_postDays"],
    [{ postTime: "10:15" }, "invalid_postTime"],
    [{ postTime: "24:00" }, "invalid_postTime"],
    [{ timezone: "Mars/Olympus" }, "invalid_timezone"],
    [{ categories: ["spam"] }, "invalid_categories"],
    [{ highlightStyle: "neon" }, "invalid_highlightStyle"],
    [{ useLogo: "yes" }, "invalid_useLogo"],
  ];
  for (const [input, message] of bad) {
    assert.throws(() => validateSocialSettings(input), { message });
  }
});

test("social settings: accepts a real timezone and half-hour time", () => {
  const out = validateSocialSettings({ timezone: "Europe/Madrid", postTime: "18:30" });
  assert.equal(out.timezone, "Europe/Madrid");
  assert.equal(out.postTime, "18:30");
});

test("facebook payload: needs text or image and respects the limit", () => {
  const base = { text: "", mediaUrls: [], mediaType: "text" as const };
  assert.deepEqual(validateFacebookPayload(base), ["facebook_post_requires_text_or_image"]);
  assert.deepEqual(validateFacebookPayload({ ...base, text: "hola" }), []);
  assert.equal(validateFacebookPayload({ ...base, text: "a".repeat(63207) }).length, 1);
});

test("instagram carousel: 2-10 images", () => {
  const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://x.test/${i}.png`);
  const p = (n: number) => ({ text: "hi", mediaUrls: urls(n), mediaType: "carousel" as const });
  assert.deepEqual(validateInstagramPayload(p(1)), ["instagram_carousel_requires_multiple_images"]);
  assert.deepEqual(validateInstagramPayload(p(10)), []);
  assert.deepEqual(validateInstagramPayload(p(11)), ["instagram_carousel_supports_max_10_images"]);
});

test("social settings: next slot respects day, time and zone", () => {
  // Wed 2026-11-18 12:00 UTC = 13:00 Madrid; Mon/Wed 10:00 Madrid → next is Mon 23rd 09:00 UTC.
  const now = new Date("2026-11-18T12:00:00Z");
  assert.equal(nextSocialSlot({ postDays: [1, 3], postTime: "10:00", timezone: "Europe/Madrid" }, now).toISOString(), "2026-11-23T09:00:00.000Z");
  // Same day still ahead: Wed 18:30 Madrid → 17:30 UTC today.
  assert.equal(nextSocialSlot({ postDays: [3], postTime: "18:30", timezone: "Europe/Madrid" }, now).toISOString(), "2026-11-18T17:30:00.000Z");
  // Only today's slot, already past → one week later.
  assert.equal(nextSocialSlot({ postDays: [3], postTime: "10:00", timezone: "UTC" }, now).toISOString(), "2026-11-25T10:00:00.000Z");
});
