import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildImageDerivatives } from "../src/infrastructure/storage/image-processing";

test("buildImageDerivatives creates hero, og and thumbnail webp variants", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "auctorio-deriv-"));
  const original = path.join(root, "orig.png");
  await sharp({
    create: {
      width: 1600,
      height: 900,
      channels: 3,
      background: { r: 30, g: 60, b: 120 },
    },
  })
    .png()
    .toFile(original);

  const result = await buildImageDerivatives({
    storageRoot: root,
    originalRelativePath: "orig.png",
    tenantId: "tenant-1",
    contentImageId: "image-1",
  });

  assert.equal(result.width, 1600);
  assert.equal(result.height, 900);

  const kinds = result.derivatives.map((derivative) => derivative.kind).sort();
  assert.deepEqual(kinds, ["hero", "og", "thumbnail"]);

  for (const derivative of result.derivatives) {
    assert.equal(derivative.mimeType, "image/webp");
    const metadata = await sharp(path.join(root, derivative.storagePath)).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, derivative.width);
    assert.equal(metadata.height, derivative.height);
  }

  await fs.rm(root, { recursive: true, force: true });
});
