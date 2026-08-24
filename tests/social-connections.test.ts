import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, tryDecryptSecret } from "../src/shared/utils/crypto";
import {
  validateInstagramPayload,
  validateXPayload,
  type SocialPublishInput,
} from "../src/studio/social-provider";
import { computeConnectionState, toConnectionView } from "../src/studio/social-connections";
import { parseDiscoveryPlan } from "../src/studio/discovery-planner";
import type { PublishingAccount } from "@prisma/client";

// The encryption helper reads the key lazily; set a test-only key for the
// crypto assertions in this file.
process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = "unit-test-encryption-key-0123456789abcdef";

// ────────────────────────────────────────────────────────────── Crypto

test("encryptSecret/decryptSecret round-trips a JSON credential payload", () => {
  const original = JSON.stringify({ accessToken: "abc.def", refreshToken: "r1" });
  const ciphertext = encryptSecret(original);
  assert.match(ciphertext, /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  assert.notEqual(ciphertext, original);
  assert.equal(decryptSecret(ciphertext), original);
});

test("tryDecryptSecret returns null on tampered or malformed ciphertext", () => {
  const ciphertext = encryptSecret("secret-value");
  const parts = ciphertext.split(":");
  const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${Buffer.from("tampered").toString("base64")}`;
  assert.equal(tryDecryptSecret(tampered), null);
  assert.equal(tryDecryptSecret("not-a-ciphertext"), null);
  assert.equal(tryDecryptSecret(""), null);
});

test("encryptSecret is non-deterministic (fresh IV per encryption)", () => {
  assert.notEqual(encryptSecret("same"), encryptSecret("same"));
});

// ────────────────────────────────────────────────────────────── X validation

function xInput(overrides: Partial<SocialPublishInput> = {}): SocialPublishInput {
  return { text: "A short post", mediaUrls: [], mediaType: "text", ...overrides };
}

test("validateXPayload accepts a short post without media", () => {
  assert.deepEqual(validateXPayload(xInput()), []);
});

test("validateXPayload rejects empty bodies and over-limit bodies", () => {
  assert.deepEqual(validateXPayload(xInput({ text: "   " })), ["x_post_requires_text"]);
  const long = "a".repeat(281);
  assert.deepEqual(validateXPayload(xInput({ text: long })), ["x_post_1_exceeds_280_characters"]);
});

test("validateXPayload validates every thread entry and caps media at 4 images", () => {
  const errors = validateXPayload(
    xInput({ text: "lead", thread: [{ body: "ok" }, { body: "b".repeat(281) }] }),
  );
  assert.deepEqual(errors, ["x_post_2_exceeds_280_characters"]);
  const tooMany = validateXPayload(xInput({ text: "ok", mediaUrls: ["a", "b", "c", "d", "e"] }));
  assert.deepEqual(tooMany, ["x_supports_max_4_images"]);
});

// ────────────────────────────────────────────────────────────── Instagram validation

function igInput(overrides: Partial<SocialPublishInput> = {}): SocialPublishInput {
  return { text: "Caption", mediaUrls: ["https://img/1.jpg"], mediaType: "photo", ...overrides };
}

test("validateInstagramPayload accepts feed photo and story", () => {
  assert.deepEqual(validateInstagramPayload(igInput()), []);
  assert.deepEqual(validateInstagramPayload(igInput({ mediaType: "story" })), []);
});

test("validateInstagramPayload enforces caption limit, carousel and feed media rules", () => {
  const longCaption = validateInstagramPayload(igInput({ text: "c".repeat(2201) }));
  assert.deepEqual(longCaption, ["instagram_caption_exceeds_2200_characters"]);
  const badCarousel = validateInstagramPayload(
    igInput({ mediaType: "carousel", mediaUrls: ["https://img/1.jpg"] }),
  );
  assert.deepEqual(badCarousel, ["instagram_carousel_requires_multiple_images"]);
  const noMedia = validateInstagramPayload(igInput({ mediaUrls: [] }));
  assert.deepEqual(noMedia, ["instagram_feed_requires_image"]);
});

// ────────────────────────────────────────────────────────────── Connection state

function account(overrides: Partial<PublishingAccount> = {}): PublishingAccount {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
    siteId: null,
    platform: "x",
    provider: "direct",
    displayName: "Test X",
    externalAccountId: null,
    credentialsRef: null,
    providerProfileId: null,
    providerAccountId: null,
    username: null,
    avatarUrl: null,
    credentialsCiphertext: null,
    connectionStatus: null,
    connectionMetadata: null,
    connectedAt: null,
    lastVerifiedAt: null,
    lastError: null,
    enabled: true,
    status: "active",
    configuration: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PublishingAccount;
}

test("computeConnectionState maps disabled and connecting states", () => {
  assert.equal(computeConnectionState(account({ enabled: false })), "disabled");
  assert.equal(computeConnectionState(account({ connectionStatus: "connecting" })), "connecting");
});

test("computeConnectionState maps connected, expired and permission states", () => {
  assert.equal(computeConnectionState(account({ connectionStatus: "connected" })), "connected");
  assert.equal(computeConnectionState(account({ connectionStatus: "expired" })), "expired");
  assert.equal(
    computeConnectionState(account({ connectionStatus: "permissions_required" })),
    "permissions_required",
  );
  assert.equal(
    computeConnectionState(account({ connectionStatus: "provider_error" })),
    "provider_error",
  );
});

test("computeConnectionState keeps legacy accounts with stored credentials connected", () => {
  const legacy = account({ provider: "legacy", credentialsRef: "credentials/x/legacy.json" });
  assert.equal(computeConnectionState(legacy), "connected");
});

test("computeConnectionState marks new-provider accounts without profile as not connected", () => {
  const pending = account({ provider: "direct", connectionStatus: null, providerProfileId: null, status: "active" });
  assert.equal(computeConnectionState(pending), "not_connected");
});

test("toConnectionView exposes capabilities and never leaks credentials", () => {
  const view = toConnectionView(
    account({
      connectionStatus: "connected",
      username: "tecnoria",
      connectionMetadata: { capabilities: { canPublish: true } },
      credentialsCiphertext: "v1:secret:ciphertext",
    }),
  );
  assert.equal(view.username, "tecnoria");
  assert.equal(view.connectionState, "connected");
  assert.deepEqual(view.capabilities, { canPublish: true });
  assert.equal(view.hasCredentials, true);
  assert.equal("credentialsCiphertext" in view, false);
});

// ────────────────────────────────────────────────────────────── Discovery plan parsing

test("parseDiscoveryPlan parses fenced JSON and drops invalid query entries", () => {
  const output = [
    "```json",
    JSON.stringify({
      queries: [
        { queryText: "anuncio oficial streaming 2026", category: "official_announcement" },
        { queryText: "", category: "breaking" },
        { queryText: "invalid category entry", category: "nonsense" },
      ],
      freshness: "recent",
      entities: ["ent1"],
      language: "es",
      reasoningSummary: "Plan operativo",
    }),
    "```",
  ].join("\n");
  const plan = parseDiscoveryPlan(output);
  assert.ok(plan);
  assert.equal(plan.queries.length, 1);
  assert.equal(plan.queries[0].queryText, "anuncio oficial streaming 2026");
  assert.equal(plan.freshness, "recent");
  assert.deepEqual(plan.entities, ["ent1"]);
});

test("parseDiscoveryPlan returns null for empty or invalid output", () => {
  assert.equal(parseDiscoveryPlan("not json at all"), null);
  assert.equal(parseDiscoveryPlan('{"queries": []}'), null);
  assert.equal(parseDiscoveryPlan(""), null);
});

test("parseDiscoveryPlan applies freshness defaults and caps lists", () => {
  const plan = parseDiscoveryPlan(
    JSON.stringify({
      queries: [{ queryText: "q", category: "latest" }],
      freshness: "unknown",
      topics: Array.from({ length: 40 }, (_, i) => `t${i}`),
    }),
  );
  assert.ok(plan);
  assert.equal(plan.freshness, "recent");
  assert.equal(plan.topics.length, 30);
});
