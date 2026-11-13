import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { getImageProvider } from "../src/infrastructure/ai/image";

test("mock image provider returns a PNG that sharp can decode and resize", async () => {
  const previous = process.env.IMAGE_PROVIDER;
  process.env.IMAGE_PROVIDER = "mock";
  try {
    const result = await getImageProvider().generate({ prompt: "x" } as never);
    const resized = await sharp(result.bytes).resize(10, 10).png().toBuffer();
    assert.ok(resized.length > 0);
  } finally {
    if (previous === undefined) delete process.env.IMAGE_PROVIDER;
    else process.env.IMAGE_PROVIDER = previous;
  }
});
