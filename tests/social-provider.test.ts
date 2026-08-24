import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret } from "../src/shared/utils/crypto";
import {
  validateInstagramPayload,
  validateXPayload,
} from "../src/studio/social-provider";
import {
  computeConnectionState,
  toConnectionView,
} from "../src/studio/social-connections";
import { parseDiscoveryPlan } from "../src/studio/discovery-planner";
import {
  detectSpamSignals,
  evaluateDomainQuality,
  QUALITY_TIERS,
} from "../src/studio/source-quality";
import type { PublishingAccount } from "@prisma/client";

function account(overrides: Partial<PublishingAccount> = {}): PublishingAccount {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tenantId: "22222222-2222-2222-2222-222222222222",
    siteId: null,
    platform: "x",
    displayName: "Test",
    externalAccountId: null,
    credentialsRef: null,
    provider: "legacy",
    providerProfileId: null,
    providerAccountId: null,
    username: null,
    avatarUrl: null,
    credentialsCiphertext: null,
    connectionStatus: null,
    connectionMetadata: null,
    connectedAt: null,
    lastError: null,
    enabled: true,
    status: "pending",
    configuration: null,
    lastVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PublishingAccount;
}

// ── Payload validation

test("X payload validation enforces length and media limits", () => {
  assert.equal(validateXPayload({ text: "Hola", mediaUrls: [], mediaType: "text" }).length, 0);
  const long = validateXPayload({ text: "a".repeat(281), mediaUrls: [], mediaType: "text" });
  assert.equal(long.length > 0, true);
  assert.match(long.join(";"), /exceeds_280/);
  const tooManyMedia = validateXPayload({ text: "Hola", mediaUrls: ["a", "b", "c", "d", "e"], mediaType: "photo" });
  assert.equal(tooManyMedia.length > 0, true);
  assert.match(tooManyMedia.join(";"), /max_4_images/);
});

test("Instagram payload validation requires media for feed posts", () => {
  assert.equal(validateInstagramPayload({ text: "Caption", mediaUrls: ["https://x/y.png"], mediaType: "photo" }).length, 0);
  const noImage = validateInstagramPayload({ text: "Caption", mediaUrls: [], mediaType: "photo" });
  assert.equal(noImage.length > 0, true);
  assert.match(noImage.join(";"), /requires_image/);
  const shortCarousel = validateInstagramPayload({ text: "Caption", mediaUrls: ["a"], mediaType: "carousel" });
  assert.equal(shortCarousel.length > 0, true);
  assert.match(shortCarousel.join(";"), /multiple_images/);
  const longCaption = validateInstagramPayload({ text: "a".repeat(2201), mediaUrls: ["a"], mediaType: "photo" });
  assert.equal(longCaption.length > 0, true);
});

// ── Connection state

test("computeConnectionState maps disabled, connected, expired and provider_error", () => {
  assert.equal(computeConnectionState(account({ enabled: false })), "disabled");
  assert.equal(computeConnectionState(account({ provider: "direct", providerProfileId: "abc", connectionStatus: "connected" })), "connected");
  assert.equal(computeConnectionState(account({ provider: "ayrshare", providerProfileId: "abc", connectionStatus: "expired" })), "expired");
  assert.equal(computeConnectionState(account({ provider: "ayrshare", providerProfileId: "abc", connectionStatus: "permissions_required" })), "permissions_required");
  assert.equal(computeConnectionState(account({ provider: "ayrshare", providerProfileId: "abc", connectionStatus: "provider_error" })), "provider_error");
  assert.equal(computeConnectionState(account({ provider: "direct", providerProfileId: null, status: "pending" })), "not_connected");
  assert.equal(computeConnectionState(account({ connectionStatus: "connecting" })), "connecting");
});

test("connection view never leaks ciphertext or credentials references", () => {
  const view = toConnectionView(account({
    provider: "direct",
    credentialsCiphertext: "v1:secret:tag:data",
    username: "brand",
  }));
  assert.equal(view.username, "brand");
  assert.equal(view.hasCredentials, true);
  const serialized = JSON.stringify(view);
  assert.ok(!serialized.includes("v1:secret"));
  assert.ok(!serialized.includes("ciphertext"));
});

// ── Encryption

test("secret encryption roundtrips and rejects malformed ciphertext", () => {
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = "test-key";
  const encrypted = encryptSecret("my-access-token");
  assert.notEqual(encrypted, "my-access-token");
  assert.equal(decryptSecret(encrypted), "my-access-token");
  assert.throws(() => decryptSecret("not-a-valid-ciphertext"), /invalid_ciphertext_format/);
  delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
});

// ── Discovery plan parsing

test("parseDiscoveryPlan accepts a valid structured plan", () => {
  const plan = parseDiscoveryPlan(JSON.stringify({
    queries: [
      { queryText: "OpenAI anuncio producto", category: "official_announcement" },
      { queryText: "regulacion IA europea", category: "breaking" },
    ],
    entities: ["OpenAI", "Google"],
    topics: ["IA", "ciberseguridad"],
    freshness: "breaking",
    preferredDomains: ["openai.com"],
    excludedDomains: ["example.com"],
    language: "es",
    country: "ES",
    reasoningSummary: "Monitor AI announcements in Spanish.",
  }));
  assert.ok(plan);
  assert.equal(plan.queries.length, 2);
  assert.equal(plan.freshness, "breaking");
  assert.equal(plan.reasoningSummary, "Monitor AI announcements in Spanish.");
});

test("parseDiscoveryPlan rejects plans without valid queries", () => {
  assert.equal(parseDiscoveryPlan("not json"), null);
  assert.equal(parseDiscoveryPlan(JSON.stringify({ queries: [] })), null);
  assert.equal(
    parseDiscoveryPlan(JSON.stringify({ queries: [{ queryText: "x", category: "nope" }] })),
    null,
  );
});

// ── Domain quality

test("official government domains reach the primary tier", () => {
  const quality = evaluateDomainQuality({
    domain: "www.cnmc.gob.es",
    tenantId: "t",
    topicKeywords: [],
    language: "es",
    blockedDomains: new Set(),
    siteBaseHost: null,
  });
  assert.equal(quality.tier, QUALITY_TIERS.TIER_1_PRIMARY);
  assert.ok(quality.score >= 50);
});

test("spammy TLDs raise risk and combined signals block outright", () => {
  assert.ok(detectSpamSignals("cheap-loans.xyz").spamRisk > 0.4);
  const blocked = evaluateDomainQuality({
    domain: "win1234free.win",
    tenantId: "t",
    topicKeywords: [],
    language: "es",
    blockedDomains: new Set(),
    siteBaseHost: null,
  });
  assert.equal(blocked.tier, QUALITY_TIERS.BLOCKED);
  assert.equal(blocked.score, 0);
});

test("blocked domains are always blocked", () => {
  const quality = evaluateDomainQuality({
    domain: "news.example.com",
    tenantId: "t",
    topicKeywords: [],
    language: "es",
    blockedDomains: new Set(["news.example.com"]),
    siteBaseHost: null,
  });
  assert.equal(quality.tier, QUALITY_TIERS.BLOCKED);
});

test("quality score stays within 0..100 and relevance lifts topic matches", () => {
  const without = evaluateDomainQuality({
    domain: "techpress.com",
    tenantId: "t",
    topicKeywords: ["streaming", "television"],
    language: "es",
    blockedDomains: new Set(),
    siteBaseHost: null,
    resultDescription: "Todo sobre streaming y television en directo",
    publishedAt: new Date().toISOString(),
  });
  assert.ok(without.score >= 0 && without.score <= 100);
  assert.ok(without.dimensions.relevance > 0);
  const irrelevant = evaluateDomainQuality({
    domain: "techpress.com",
    tenantId: "t",
    topicKeywords: ["streaming", "television"],
    language: "es",
    blockedDomains: new Set(),
    siteBaseHost: null,
    resultDescription: "Recetas de cocina para principiantes",
  });
  assert.ok(without.dimensions.relevance > irrelevant.dimensions.relevance);
});
