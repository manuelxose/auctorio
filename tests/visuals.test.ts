import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { stripImageMetadata } from "../src/infrastructure/storage/image-processing";
import { parseYoutubeOrganic } from "../src/infrastructure/seo/dataforseo";
import { infographicPrompt, infographicSection, insertYoutube, imageStylePrompt, readVisualSettings, youtubeCandidates } from "../src/studio/editorial-engine/visuals";
import { resolveArticleTargets, resolveVisualSettings } from "../src/studio/editorial-engine/structure";
import { inlineAlt } from "../src/studio/inline-images";
import { comparesOptions } from "../src/studio/editorial-engine/quality-checklist";
import { sanitizeEditorialHtml } from "../src/studio/html-sanitizer";

test("M6 metadata: EXIF/XMP are gone after re-encoding (JPEG and PNG); unknown bytes are kept", async () => {
  const base = sharp({ create: { width: 32, height: 32, channels: 3, background: "#336699" } });
  const jpeg = await base.clone().jpeg().withMetadata({ exif: { IFD0: { Software: "AI generator", Copyright: "c2pa" } } }).toBuffer();
  assert.ok((await sharp(jpeg).metadata()).exif, "fixture carries EXIF");
  const cleanJpeg = await stripImageMetadata(jpeg);
  assert.equal(cleanJpeg.stripped, true);
  const meta = await sharp(cleanJpeg.bytes).metadata();
  assert.equal(meta.exif, undefined);
  assert.equal(meta.xmp, undefined);
  assert.equal(meta.format, "jpeg");

  const png = await base.clone().png().withMetadata({ exif: { IFD0: { Software: "AI generator" } } }).toBuffer();
  const cleanPng = await stripImageMetadata(png);
  assert.equal((await sharp(cleanPng.bytes).metadata()).exif, undefined);
  assert.equal((await sharp(cleanPng.bytes).metadata()).format, "png");

  const junk = Buffer.from("not an image");
  assert.deepEqual(await stripImageMetadata(junk), { bytes: junk, stripped: false });
});

test("M6 visuals settings: validated, stored next to the targets, ignored by target resolution", () => {
  const visuals = readVisualSettings({ coverStyle: "cartoon", bodyStyle: "media_library", infographic: true, imageInstructions: "  sin personas ", youtube: { enabled: true, channelOnly: true, channelUrl: "https://www.youtube.com/@guiatv" } });
  assert.equal(visuals.coverStyle, "realistic");
  assert.equal(visuals.bodyStyle, "media_library");
  assert.equal(visuals.imageInstructions, "sin personas");
  assert.deepEqual(visuals.youtube, { enabled: true, channelOnly: true, channelUrl: "https://www.youtube.com/@guiatv", approved: [] });
  assert.deepEqual(readVisualSettings({ youtube: { approved: [{ id: "abcdefghijk", title: " Mi  vídeo " }, { id: "bad", title: "x" }, { id: "ABCDEFGHIJK" }, "x"] } }).youtube.approved, [{ id: "abcdefghijk", title: "Mi vídeo" }]);
  assert.equal(readVisualSettings({ youtube: { enabled: true, channelOnly: true, channelUrl: "https://evil.com/@x" } }).youtube.channelOnly, false);
  assert.equal(resolveVisualSettings({ visuals: { infographic: true } }).infographic, true);
  assert.equal(resolveVisualSettings(null).infographic, false);
  assert.ok(!("visuals" in resolveArticleTargets({ visuals: { infographic: true } })));
  assert.match(imageStylePrompt("illustration", "sin personas"), /flat editorial illustration[\s\S]*Site image instructions: sin personas/);
  assert.equal(imageStylePrompt("media_library", ""), "");
});

test("M6 infographic: only a section with steps or a comparison qualifies", () => {
  const body = "<p>Intro</p><h2>Qué es</h2><p>Texto.</p><h2>Cómo sintonizar</h2><ol><li>Pulsa Menú</li><li>Busca canales</li></ol><h2>FAQ</h2>";
  assert.deepEqual(infographicSection(body), { index: 1, heading: "Cómo sintonizar", text: "Pulsa Menú · Busca canales" });
  assert.equal(infographicSection("<h2>A</h2><p>b</p>"), null);
  assert.match(infographicPrompt("Cómo sintonizar", "Pulsa Menú · Busca canales", "es"), /^Editorial infographic[\s\S]*Pulsa Menú[\s\S]*Spanish/);
});

test("M6 YouTube: parsed from the SERP, channel filter, one no-JS figure before the second H2", () => {
  const body = {
    status_code: 20000,
    cost: 0.002,
    tasks: [{ status_code: 20000, result: [{ items: [
      { type: "youtube_channel", title: "x" },
      { type: "youtube_video", video_id: "abcdefghijk", title: "Cómo ver la TDT", channel_name: "Tech", channel_url: "https://www.youtube.com/@tech" },
      { type: "youtube_video", video_id: "ABCDEFGHIJK", title: "TDT en casa", channel_name: "GuíaTV", channel_url: "https://www.youtube.com/@guiatv" },
      { type: "youtube_video", video_id: "short", title: "bad id" },
    ] }] }],
  };
  const { videos, costUsd } = parseYoutubeOrganic(body);
  assert.equal(costUsd, 0.002);
  assert.deepEqual(videos.map((video) => video.id), ["abcdefghijk", "ABCDEFGHIJK"]);
  const ids = (channelOnly: boolean, channelUrl: string) => youtubeCandidates(videos, { channelOnly, channelUrl }).map(({ id }) => id);
  assert.deepEqual(ids(false, ""), ["abcdefghijk", "ABCDEFGHIJK"]);
  assert.deepEqual(ids(true, "https://www.youtube.com/@guiatv"), ["ABCDEFGHIJK"]);
  assert.deepEqual(ids(true, "https://www.youtube.com/@other"), []);

  const html = insertYoutube("<p>i</p><h2>Uno</h2><p>a</p><h2>Dos</h2><p>b</p>", videos[0]);
  assert.ok(html.indexOf('data-block="youtube"') > html.indexOf("Uno") && html.indexOf('data-block="youtube"') < html.indexOf("Dos"));
  assert.equal(insertYoutube(html, videos[1]), html, "once per article");
  const clean = sanitizeEditorialHtml(html);
  assert.match(clean, /<figure data-block="youtube"><a href="https:\/\/www\.youtube\.com\/watch\?v=abcdefghijk" rel="noopener noreferrer"><img src="https:\/\/i\.ytimg\.com\/vi\/abcdefghijk\/hqdefault\.jpg" alt="Cómo ver la TDT"/);
  assert.ok(!/<iframe|<script/.test(clean));
});

test("M6 alt and M3 comparison rule", () => {
  assert.equal(inlineAlt("Cómo ver la TDT por internet", "ver la tdt"), "Cómo ver la TDT por internet");
  assert.equal(inlineAlt("Qué canales hay", "canales gratis"), "Qué canales hay: canales gratis");
  assert.equal(inlineAlt("", "canales gratis"), "canales gratis");
  assert.equal(comparesOptions("mejores plataformas de streaming", ""), true);
  assert.equal(comparesOptions("qué es la tdt", "<h2>Precios de cada opción</h2>"), true);
  assert.equal(comparesOptions("qué es la tdt", "<h2>Historia</h2>"), false);
});
