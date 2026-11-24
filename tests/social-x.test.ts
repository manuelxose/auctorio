import assert from "node:assert/strict";
import test from "node:test";
import { DirectSocialProvider } from "../src/studio/social-provider-direct";
import { getSocialPublisher } from "../src/studio/social-publishers";
import { formatXThread, xArticleText, xWeightedLength } from "../src/studio/social-x";

test("X thread splits in order, counts Unicode and puts the article link last", () => {
  const emoji = "👩🏽‍💻";
  const url = `https://example.com/${"a".repeat(350)}`;
  const posts = formatXThread(xArticleText(`Hook\n\n${emoji.repeat(150)} final idea [URL]`, url));
  assert.equal(posts.length, 3);
  assert.equal(posts[0].body, "1/3 Hook");
  assert.ok(posts[1].body.startsWith(`2/3 ${emoji}`));
  assert.ok(posts[2].body.endsWith(`final idea ${url}`));
  assert.ok(posts.every(({ body }) => xWeightedLength(body) <= 280));
  assert.equal(posts.map(({ body }) => body.split(emoji).length - 1).reduce((sum, count) => sum + count), 150);
  assert.equal(xWeightedLength(url), 23);
});

const account = { platform: "x", providerProfileId: null, providerAccountId: null };
const payload = {
  text: "Hook",
  mediaUrls: ["https://assets.example.com/cover.jpg"],
  mediaType: "photo",
  thread: [{ body: "1/2 Hook" }, { body: "2/2 Details https://example.com/article" }],
} as const;

test("direct X uploads the cover once and chains the second post to the first", async (t) => {
  const requests: Array<{ url: string; method: string | undefined; body: unknown }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    requests.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url === payload.mediaUrls[0]) return new Response("cover bytes");
    return Response.json({ data: { id: String(requests.length) } });
  });
  const result = await new DirectSocialProvider().publish({
    ...payload, mediaUrls: [...payload.mediaUrls], thread: [...payload.thread],
  }, { accessToken: "test" }, account);
  assert.deepEqual(requests, [
    { url: payload.mediaUrls[0], method: "GET", body: null },
    { url: "https://api.x.com/2/media/upload", method: "POST", body: { media: Buffer.from("cover bytes").toString("base64"), media_category: "tweet_image" } },
    { url: "https://api.x.com/2/tweets", method: "POST", body: { text: payload.thread[0].body, media: { media_ids: ["2"] } } },
    { url: "https://api.x.com/2/tweets", method: "POST", body: { text: payload.thread[1].body, reply: { in_reply_to_tweet_id: "3" } } },
  ]);
  assert.equal(result.externalId, "3");
  assert.deepEqual(result.responsePayload?.tweetIds, ["3", "4"]);
});

test("direct X cleans up the first post when the next post is rejected", async (t) => {
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    requests.push(`${init?.method} ${url}`);
    if (requests.length === 1) return Response.json({ data: { id: "first" } });
    if (requests.length === 2) return new Response("bad request", { status: 400 });
    return new Response(null, { status: 204 });
  });
  await assert.rejects(new DirectSocialProvider().publish({
    ...payload, mediaUrls: [], mediaType: "text", thread: [...payload.thread],
  }, { accessToken: "test" }, account), /x_publish_failed status=400/);
  assert.deepEqual(requests, [
    "POST https://api.x.com/2/tweets",
    "POST https://api.x.com/2/tweets",
    "DELETE https://api.x.com/2/tweets/first",
  ]);
});

test("X dry-run bypasses all HTTP requests even with credentials and media", async (t) => {
  const previous = process.env.PUBLISH_DRY_RUN;
  process.env.PUBLISH_DRY_RUN = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.PUBLISH_DRY_RUN;
    else process.env.PUBLISH_DRY_RUN = previous;
  });
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("unexpected HTTP call"); });
  const result = await getSocialPublisher("x").publish({
    text: payload.text, imageUrls: [...payload.mediaUrls], mediaType: "photo", thread: [...payload.thread],
  }, { apiKey: "key", apiSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret" });
  assert.equal(result.dryRun, true);
  assert.equal(fetch.mock.callCount(), 0);
});
