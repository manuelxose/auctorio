import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDestinationUrl,
  validateDestinationUrl,
} from "../src/studio/connectors/discovery";

test("normalizeDestinationUrl adds scheme and canonicalizes origin", () => {
  assert.equal(normalizeDestinationUrl("example.com"), "https://example.com");
  assert.equal(normalizeDestinationUrl("HTTP://Example.COM/path?q=1#frag"), "http://example.com");
  assert.equal(normalizeDestinationUrl("https://example.com/"), "https://example.com");
});

test("normalizeDestinationUrl rejects invalid and credential-bearing input", () => {
  assert.throws(() => normalizeDestinationUrl(""), /url_required/);
  assert.throws(() => normalizeDestinationUrl("not a url at all"), /invalid_url/);
  assert.throws(() => normalizeDestinationUrl("https://user:pass@example.com"), /url_credentials_not_allowed/);
  assert.throws(() => normalizeDestinationUrl("ftp://example.com"), /url_protocol_not_allowed/);
});

test("validateDestinationUrl blocks loopback and private targets (SSRF)", async () => {
  for (const target of [
    "http://localhost",
    "http://localhost:8080",
    "http://127.0.0.1",
    "http://10.0.0.1",
    "http://192.168.1.1",
    "http://169.254.169.254/latest/meta-data",
    "http://0.0.0.0",
    "http://[::1]",
  ]) {
    await assert.rejects(
      () => validateDestinationUrl(target),
      /invalid_host|private_ip_blocked|invalid_url|url_protocol_not_allowed/,
      `expected ${target} to be blocked`,
    );
  }
});

test("validateDestinationUrl accepts a public origin", async () => {
  const parsed = await validateDestinationUrl("https://example.com");
  assert.equal(parsed.origin, "https://example.com");
});
