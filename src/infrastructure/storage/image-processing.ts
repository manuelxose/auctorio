import sharp from "sharp";
import path from "node:path";
import { promises as fs } from "node:fs";

export type ImageDerivative = {
  kind: "hero" | "og" | "thumbnail";
  storagePath: string;
  width: number;
  height: number;
  mimeType: "image/webp";
};

export type ImageDerivativesResult = {
  width: number;
  height: number;
  derivatives: ImageDerivative[];
};

type DerivativeSpec = {
  kind: ImageDerivative["kind"];
  width: number;
  height: number;
};

const DERIVATIVES: DerivativeSpec[] = [
  { kind: "hero", width: 1280, height: 720 },
  { kind: "og", width: 1200, height: 630 },
  { kind: "thumbnail", width: 480, height: 270 },
];

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

export async function buildImageDerivatives(input: {
  storageRoot: string;
  originalRelativePath: string;
  tenantId: string;
  contentImageId: string;
}): Promise<ImageDerivativesResult> {
  const originalPath = resolveInsideStorageRoot(input.storageRoot, input.originalRelativePath);
  const metadata = await sharp(originalPath).metadata();
  if (metadata.width === undefined || metadata.height === undefined) {
    throw new Error(`Unable to read dimensions for image: ${input.originalRelativePath}`);
  }

  assertSafeSegment(input.tenantId);
  assertSafeSegment(input.contentImageId);
  const directory = path.posix.join(input.tenantId, "derivatives", input.contentImageId);
  const absoluteDirectory = resolveInsideStorageRoot(input.storageRoot, directory);
  await fs.mkdir(absoluteDirectory, { recursive: true });

  const derivatives = await Promise.all(
    DERIVATIVES.map(async (spec): Promise<ImageDerivative> => {
      const storagePath = path.posix.join(directory, `${spec.kind}.webp`);
      await sharp(originalPath)
        .resize(spec.width, spec.height, { fit: "cover" })
        .webp()
        .toFile(resolveInsideStorageRoot(input.storageRoot, storagePath));
      return { ...spec, storagePath, mimeType: "image/webp" };
    }),
  );

  return { width: metadata.width, height: metadata.height, derivatives };
}
