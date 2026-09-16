import { promises as fs } from "node:fs";
import path from "node:path";
import { getEnv } from "../../shared/utils/env";

export type SavedImageAsset = {
  relativePath: string;
};

function resolveInsideStorageRoot(storageRoot: string, relativePath: string): string {
  const root = path.resolve(storageRoot);
  const absolutePath = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, absolutePath);
  if (
    relativeToRoot === "" ||
    relativeToRoot === ".." ||
    relativeToRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToRoot)
  ) {
    throw new Error("storage path is outside storage root");
  }
  return absolutePath;
}

function assertSafeSegment(value: string): void {
  if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\") || value.includes("\0")) {
    throw new Error("storage path is outside storage root");
  }
}

export async function saveImageAsset(input: {
  tenantId: string;
  contentImageId: string;
  bytes: Buffer;
  extension: string;
}): Promise<SavedImageAsset> {
  const storageRoot = path.resolve(getEnv("STORAGE_ROOT", "/var/www/auctorio/storage"));
  assertSafeSegment(input.tenantId);
  assertSafeSegment(input.contentImageId);
  const extension = input.extension.startsWith(".") ? input.extension : `.${input.extension}`;
  assertSafeSegment(extension.slice(1));
  const relativePath = path.posix.join(input.tenantId, `${input.contentImageId}${extension}`);
  const absolutePath = resolveInsideStorageRoot(storageRoot, relativePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, input.bytes);

  return { relativePath };
}
