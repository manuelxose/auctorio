import assert from "node:assert/strict";
import test from "node:test";
import {
  buildItemContentHash,
  deriveExternalId,
  normalizeCanonicalUrl,
  stripHtmlToText,
} from "../src/studio/sources";
import {
  buildSemanticHash,
  scoreSourceItem,
  titleSimilarity,
  type ScoringContext,
} from "../src/studio/editorial";
import {
  canTransition,
  classifyPublicationError,
  maxPublicationRetries,
  nextRetryDelay,
  PUBLICATION_STATES,
} from "../src/studio/publication";
import {
  extractHashtags,
  extractJsonObject,
  parseGeneratedSocial,
  validateSocialPiece,
} from "../src/studio/social";
import {
  generateEditorialSlots,
  isDayActive,
  readPublishingWindows,
} from "../src/studio/automation";

test("normalizeCanonicalUrl strips tracking params and fragments", () => {
  const normalized = normalizeCanonicalUrl(
    "https://Example.com/news/story?utm_source=x&utm_medium=y&a=1#section",
  );
  assert.equal(normalized, "https://example.com/news/story?a=1");
});

test("normalizeCanonicalUrl rejects malformed URLs", () => {
  assert.equal(normalizeCanonicalUrl("not a url"), null);
});

test("deriveExternalId is deterministic and based on URL", () => {
  const first = deriveExternalId("https://example.com/a", "Title A");
  const second = deriveExternalId("https://example.com/a", "Title A");
  const other = deriveExternalId("https://example.com/b", "Title A");
  assert.equal(first, second);
  assert.notEqual(first, other);
});

test("content hashes match for identical content and differ otherwise", () => {
  const first = buildItemContentHash("Same title", "Same body");
  const second = buildItemContentHash("Same title", "Same body");
  const different = buildItemContentHash("Same title", "Different body");
  assert.equal(first, second);
  assert.notEqual(first, different);
});

test("stripHtmlToText removes scripts and normalizes whitespace", () => {
  const text = stripHtmlToText("<p>Hello   world</p><script>bad()</script><p>Second line</p>");
  assert.equal(text, "Hello world Second line");
});

test("semantic hashes are stable lexical fingerprints", () => {
  assert.equal(buildSemanticHash("Alpha story", "beta gamma"), buildSemanticHash("Alpha story", "beta gamma"));
  assert.notEqual(buildSemanticHash("Alpha story", "beta gamma"), buildSemanticHash("Delta story", "beta gamma"));
});

test("titleSimilarity detects near-duplicate titles", () => {
  const similar = titleSimilarity(
    "Real Madrid beats Barcelona 3-1 in El Clasico",
    "Barcelona loses 1-3 against Real Madrid in El Clasico",
  );
  const unrelated = titleSimilarity(
    "Real Madrid beats Barcelona 3-1 in El Clasico",
    "New streaming service launches in Spain",
  );
  assert.ok(similar > unrelated, `expected ${similar} > ${unrelated}`);
  assert.ok(titleSimilarity("same title", "same title") === 1);
  assert.equal(titleSimilarity("", ""), 0);
});

test("scoreSourceItem explains every signal and penalizes covered stories", () => {
  const baseContext: ScoringContext = {
    sourceTrustScore: 0.8,
    sourcePriority: 0,
    now: new Date(),
  };
  const item = {
    title: "Breaking transfer news",
    description: "Long enough description with details about the transfer".padEnd(220, "x"),
    publishedAt: new Date(),
    discoveredAt: new Date(),
    categories: ["football"],
  };

  const fresh = scoreSourceItem(item, baseContext);
  assert.ok(fresh.score >= 0, "score is non-negative");
  assert.ok(fresh.explanation.length >= 4, "explains its signals");
  assert.ok(fresh.explanation.some((entry) => entry.signal === "freshness"));

  const covered = scoreSourceItem(item, {
    ...baseContext,
    coveredTitles: [item.title],
  });
  assert.ok(covered.score < fresh.score, "coverage penalty reduces score");

  const priorityBoost = scoreSourceItem(item, {
    ...baseContext,
    priorityTopics: ["transfer"],
  });
  assert.ok(priorityBoost.score > fresh.score, "priority topics boost score");
});

test("story scoring respects excluded categories", () => {
  const context: ScoringContext = {
    sourceTrustScore: 0.9,
    sourcePriority: 2,
    excludedCategories: ["gossip"],
  };
  const item = {
    title: "Some gossip",
    description: "description",
    publishedAt: new Date(),
    discoveredAt: new Date(),
    categories: ["gossip"],
  };
  const result = scoreSourceItem(item, context);
  assert.ok(result.explanation.some((entry) => entry.signal === "excluded_category"));
});

test("publication state machine rejects invalid transitions", () => {
  assert.ok(canTransition("draft", "ready"));
  assert.ok(canTransition("ready", "scheduled"));
  assert.ok(canTransition("scheduled", "queued"));
  assert.ok(canTransition("queued", "publishing"));
  assert.ok(canTransition("publishing", "published"));
  assert.ok(canTransition("published", "unpublished"));
  assert.ok(canTransition("failed", "queued"));
  assert.ok(canTransition("scheduled", "canceled"));
  assert.ok(!canTransition("published", "publishing"), "published cannot go backwards to publishing");
  assert.ok(!canTransition("deleted", "scheduled"));
  assert.ok(!canTransition("draft", "published"), "cannot jump straight to published");
  assert.equal(PUBLICATION_STATES.length, 10);
});

test("failure classification separates transient from permanent", () => {
  assert.equal(classifyPublicationError("fetch failed: timeout"), "transient");
  assert.equal(classifyPublicationError("status=429 rate limited"), "transient");
  assert.equal(classifyPublicationError("status=502 upstream error"), "transient");
  assert.equal(classifyPublicationError("invalid_credentials"), "permanent");
  assert.equal(classifyPublicationError("status=401 unauthorized"), "permanent");
  assert.equal(classifyPublicationError("status=403 permission denied"), "permanent");
});

test("retry backoff grows exponentially and is capped", () => {
  assert.equal(maxPublicationRetries(), 3);
  const first = nextRetryDelay(0);
  const second = nextRetryDelay(1);
  const capped = nextRetryDelay(20);
  assert.ok(second > first);
  assert.ok(capped <= 3_600_000);
});

test("social parsing extracts JSON objects even inside prose", () => {
  const parsed = extractJsonObject('Sure! Here is the post:\n{"post": "Hello world", "hashtags": ["#news"]}');
  assert.ok(parsed);
  assert.equal(parsed.post, "Hello world");
  assert.deepEqual(parsed.hashtags, ["#news"]);
  assert.equal(extractJsonObject("no json here"), null);
});

test("x post parsing validates character limits", () => {
  const pieces = parseGeneratedSocial("x", "x_post", '{"post": "Short post [URL]", "hashtags": ["#a"]}');
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].body, "Short post [URL]");

  const longBody = "a".repeat(281);
  const tooLong = validateSocialPiece({
    channel: "x",
    contentType: "x_post",
    body: longBody,
    title: null,
    hashtags: [],
    mentions: [],
  });
  assert.equal(tooLong.valid, false);
  assert.ok(tooLong.errors.some((error) => error.includes("280")));
});

test("thread parsing returns ordered posts", () => {
  const pieces = parseGeneratedSocial(
    "x",
    "x_thread",
    '{"posts": [{"body": "First"}, {"body": "Second"}], "hashtags": ["#x"]}',
  );
  assert.equal(pieces.length, 2);
  assert.equal(pieces[0].body, "First");
  assert.equal(pieces[1].hashtags.length, 1);
});

test("instagram caption parsing extracts hashtags when missing from JSON", () => {
  const pieces = parseGeneratedSocial("instagram", "instagram_caption", '{"caption": "Great news #football #tv"}');
  assert.equal(pieces.length, 1);
  assert.deepEqual(pieces[0].hashtags, ["#football", "#tv"]);
});

test("hashtag extraction is case-preserving and deduplicated", () => {
  const hashtags = extractHashtags("Hello #News and #news!");
  assert.deepEqual(hashtags, ["#News", "#news"]);
});

test("editorial slots spread articles across the window with social offsets", () => {
  const policy = {
    timezone: "Europe/Madrid",
    articlesPerDay: 3,
    xPostsPerDay: 5,
    instagramPostsPerDay: 2,
    socialTimingMinutesX: 5,
    socialTimingMinutesInstagram: 60,
    activeDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    publishingWindows: [
      { channel: "website", days: [0, 1, 2, 3, 4, 5, 6], from: "08:00", to: "20:00" },
      { channel: "x", days: [0, 1, 2, 3, 4, 5, 6], from: "08:00", to: "22:00" },
      { channel: "instagram", days: [0, 1, 2, 3, 4, 5, 6], from: "09:00", to: "21:00" },
    ],
  } as never;

  const dayStart = new Date("2026-08-24T00:00:00Z");
  const slots = generateEditorialSlots(policy as never, dayStart);
  const articles = slots.filter((slot) => slot.channel === "website");
  const xPosts = slots.filter((slot) => slot.channel === "x");
  const igPosts = slots.filter((slot) => slot.channel === "instagram");

  assert.equal(articles.length, 3);
  assert.equal(xPosts.length, 3);
  assert.equal(igPosts.length, 3);
  assert.ok(articles[0].at < articles[1].at && articles[1].at < articles[2].at);
  assert.ok(xPosts[0].at.getTime() > articles[0].at.getTime());
});

test("active day filtering respects configured days of week", () => {
  const policy = {
    activeDaysOfWeek: [1, 3],
    publishingWindows: [{ channel: "website", days: [1], from: "08:00", to: "20:00" }],
  } as never;
  const monday = new Date("2026-08-24T12:00:00Z"); // Monday
  const sunday = new Date("2026-08-23T12:00:00Z"); // Sunday
  assert.equal(isDayActive(policy as never, monday), true);
  assert.equal(isDayActive(policy as never, sunday), false);
  assert.equal(readPublishingWindows(policy as never).length, 1);
});
