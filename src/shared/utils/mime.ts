import path from "node:path";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

export function getContentTypeFromPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}
