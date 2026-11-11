import test from "node:test";
import assert from "node:assert/strict";
import { parseWaitlistSignup } from "../src/studio/waitlist";

test("waitlist accepts a valid signup and normalises it", () => {
  const result = parseWaitlistSignup({
    email: "  Editor@Example.TEST ",
    name: " Laura ",
    company: "",
    message: "Two news sites",
    locale: "es",
    sourcePath: "/es/lista-de-espera",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.email, "editor@example.test");
    assert.equal(result.value.name, "Laura");
    assert.equal(result.value.company, null);
    assert.equal(result.value.locale, "es");
    assert.equal(result.value.sourcePath, "/es/lista-de-espera");
  }
});

test("waitlist rejects a missing or malformed email", () => {
  assert.deepEqual(parseWaitlistSignup({ name: "Laura" }), { ok: false, error: "invalid_email" });
  assert.deepEqual(parseWaitlistSignup({ email: "not-an-email", name: "Laura" }), { ok: false, error: "invalid_email" });
});

test("waitlist requires a name", () => {
  assert.deepEqual(parseWaitlistSignup({ email: "a@b.co", name: "   " }), { ok: false, error: "name_required" });
});

test("waitlist drops external source URLs and unknown locales", () => {
  const result = parseWaitlistSignup({ email: "a@b.co", name: "A", locale: "fr", sourcePath: "https://evil.example/x" });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.locale, "en");
    assert.equal(result.value.sourcePath, null);
  }

  const protocolRelative = parseWaitlistSignup({ email: "a@b.co", name: "A", sourcePath: "//evil.example/x" });
  assert.equal(protocolRelative.ok && protocolRelative.value.sourcePath, null);
});
