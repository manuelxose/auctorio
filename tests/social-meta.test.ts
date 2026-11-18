import test from "node:test";
import assert from "node:assert/strict";
import { buildInstagramCarouselBodies, getSocialPublisher } from "../src/studio/social-publishers";
import { buildSocialPrompt, parseGeneratedSocial, pickSocialCategory } from "../src/studio/social";
import { renderSlideSvg, wrapText } from "../src/studio/social-slides";

const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn.test/s${i + 1}.png`);

test("ig carousel: one carousel-item container per image, in order, then CAROUSEL", () => {
  const body = buildInstagramCarouselBodies({ text: "caption", imageUrls: urls(3), mediaType: "carousel" });
  assert.deepEqual(body.children.map((child) => child.image_url), urls(3));
  assert.ok(body.children.every((child) => child.is_carousel_item === true));
  assert.equal(body.carousel.media_type, "CAROUSEL");
});

test("ig carousel: rejects fewer than 2 or more than 10 images, trims caption to 2200", () => {
  assert.throws(() => buildInstagramCarouselBodies({ text: "x", imageUrls: urls(1), mediaType: "carousel" }));
  assert.throws(() => buildInstagramCarouselBodies({ text: "x", imageUrls: urls(11), mediaType: "carousel" }));
  const body = buildInstagramCarouselBodies({ text: "a".repeat(3000), imageUrls: urls(2), mediaType: "carousel" });
  assert.equal(String(body.carousel.caption).length, 2200);
});

test("parse: carousel output keeps caption, hashtags and ordered slides", () => {
  const output = 'Here:\n{"caption":"Hook","hashtags":["#tv"],"slides":[{"headline":"Uno","body":"a"},{"headline":"","body":"skip"},{"headline":"Dos","body":"b"}]}';
  const [piece] = parseGeneratedSocial("instagram", "instagram_carousel", output);
  assert.equal(piece.body, "Hook");
  assert.deepEqual(piece.hashtags, ["#tv"]);
  assert.deepEqual(piece.slides?.map((slide) => slide.headline), ["Uno", "Dos"]);
  const [fb] = parseGeneratedSocial("facebook", "facebook_post", output);
  assert.equal(fb.slides?.length, 2);
  const [caption] = parseGeneratedSocial("instagram", "instagram_story", '{"overlay":"hi"}');
  assert.equal(caption.slides, undefined);
});

test("prompt: facebook and carousel prompts carry the category angle and brand voice", () => {
  const context = { title: "T", excerpt: "E", bodyPlain: "B", siteName: "Guia", language: "es", articleUrl: null, category: "myths", brandVoice: "cercano" };
  const fb = buildSocialPrompt("facebook", "facebook_post", context);
  assert.match(fb.systemPrompt, /Facebook/);
  assert.match(fb.systemPrompt, /cercano/);
  assert.match(fb.userPrompt, /Myths vs facts/);
  assert.match(buildSocialPrompt("instagram", "instagram_carousel", context).userPrompt, /carousel of 4-7 slides/);
});

test("category pick is deterministic and limited to the site's categories", () => {
  assert.equal(pickSocialCategory(["a", "b", "c"], "v1"), pickSocialCategory(["a", "b", "c"], "v1"));
  assert.ok(["a", "b"].includes(pickSocialCategory(["a", "b"], "whatever")));
  assert.equal(pickSocialCategory([], "v1"), "educational");
});

test("slides: wraps text, escapes XML, shows brand and page counter", () => {
  assert.deepEqual(wrapText("uno dos tres cuatro", 8), ["uno dos", "tres", "cuatro"]);
  const svg = renderSlideSvg(
    { headline: "Tom & Jerry <vuelve>", body: "cuerpo" },
    { fontFamily: "serif", highlightStyle: "marker", imageStyle: "sketch", showBrandMark: true, brandName: "Guía TV", accent: "#ff0000" },
    1,
    5,
  );
  assert.match(svg, /Tom &amp; Jerry &lt;vuelve&gt;/);
  assert.match(svg, /Guía TV/);
  assert.match(svg, /2\/5/);
  assert.match(svg, /Georgia/);
});

test("facebook publisher: dry run returns a dryrun id without calling Graph", async () => {
  process.env.PUBLISH_DRY_RUN = "true";
  const result = await getSocialPublisher("facebook").publish(
    { text: "hola", imageUrls: urls(3), mediaType: "carousel" },
    { accessToken: "t", pageId: "p" },
  );
  assert.equal(result.dryRun, true);
  assert.match(String(result.externalId), /^dryrun-facebook-/);
});
