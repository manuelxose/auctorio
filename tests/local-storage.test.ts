import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveImageAsset } from "../src/infrastructure/storage/local-storage";

test("saveImageAsset writes tenant-scoped image bytes and rejects traversal", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "auctorio-storage-"));
  const previousRoot = process.env.STORAGE_ROOT;
  process.env.STORAGE_ROOT = root;

  try {
    const result = await saveImageAsset({
      tenantId: "tenant-1",
      contentImageId: "image-1",
      bytes: Buffer.from("image-bytes"),
      extension: ".png",
    });

    assert.equal(result.relativePath, "tenant-1/image-1.png");
    assert.deepEqual(await fs.readFile(path.join(root, result.relativePath)), Buffer.from("image-bytes"));

    await assert.rejects(
      saveImageAsset({
        tenantId: "../outside",
        contentImageId: "image-2",
        bytes: Buffer.from("image-bytes"),
        extension: ".png",
      }),
      /outside storage root/,
    );
  } finally {
    if (previousRoot === undefined) {
      delete process.env.STORAGE_ROOT;
    } else {
      process.env.STORAGE_ROOT = previousRoot;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});
