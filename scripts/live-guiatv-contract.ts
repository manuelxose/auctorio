/**
 * Live GuiaTV contract test — requires GUIATV_AUCTORIO_ADMIN_KEY and the
 * production GuiaTV API reachable. NEVER runs as part of `npm test`.
 *
 * Usage: npm run test:live:guiatv
 *
 * Creates a draft, updates it, validates auth/validation errors, then deletes
 * it. The marker slug keeps every run isolated and self-cleaning.
 */
import { getEnv } from "../src/shared/utils/env";

const BASE = "https://guiaprogramaciontv.com";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
};

type PostShape = {
  id: string;
  slug: string;
  status: string;
  title: { rendered: string };
  link: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`CONTRACT FAILED: ${message}`);
  }
}

async function call(
  path: string,
  options: { method?: string; adminKey?: string; body?: unknown } = {},
): Promise<{ status: number; body: ApiEnvelope<{ post?: PostShape; deleted?: boolean; id?: string }> }> {
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(options.adminKey ? { "x-admin-key": options.adminKey } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, body: (await response.json()) as never };
}

async function main() {
  const adminKey = getEnv("GUIATV_AUCTORIO_ADMIN_KEY", "");
  assert(Boolean(adminKey), "GUIATV_AUCTORIO_ADMIN_KEY is required");
  const slug = `auctorio-live-contract-${Date.now().toString(36)}`;
  const title = `Auctorio contract test ${slug}`;

  // 1. Auth: missing key must be rejected with 403.
  const noKey = await call("/v2/blog", { method: "POST", body: { title, slug, status: "draft" } });
  assert(noKey.status === 403, `expected 403 without admin key, got ${noKey.status}`);
  assert(noKey.body.error?.code === "FORBIDDEN", `expected FORBIDDEN error code, got ${noKey.body.error?.code}`);

  // 2. Create draft.
  const created = await call("/v2/blog", {
    method: "POST",
    adminKey,
    body: { title, slug, status: "draft", contentType: "guide" },
  });
  assert(created.status === 201, `expected 201 on create, got ${created.status}`);
  assert(created.body.success === true, "expected success=true envelope");
  const postId = created.body.data?.post?.id;
  assert(Boolean(postId), "create must return data.post.id");
  assert(!String(postId).startsWith("dryrun-"), "external id must be real");
  assert(created.body.data?.post?.link === `/editorial/${slug}`, `expected link /editorial/${slug}`);

  // 3. Validation: unknown relatedRouteKey must be rejected.
  const invalid = await call("/v2/blog", {
    method: "POST",
    adminKey,
    body: { title, slug: `${slug}-bad`, status: "draft", relatedRouteKeys: ["not-a-route"] },
  });
  assert(invalid.status === 400, `expected 400 for invalid relatedRouteKeys, got ${invalid.status}`);

  // 4. Update the same draft.
  const updated = await call(`/v2/blog/${postId}`, {
    method: "PUT",
    adminKey,
    body: { title: `${title} updated`, status: "publish", contentType: "guide" },
  });
  assert(updated.status === 200, `expected 200 on update, got ${updated.status}`);
  assert(updated.body.data?.post?.id === postId, "update must return the same post id");
  assert(updated.body.data?.post?.status === "publish", "status must be publish after update");

  // 5. Delete (withdraw).
  const deleted = await call(`/v2/blog/${postId}`, { method: "DELETE", adminKey });
  assert(deleted.status === 200, `expected 200 on delete, got ${deleted.status}`);
  assert(deleted.body.data?.deleted === true, "delete must return deleted=true");

  // 6. Gone after delete.
  const gone = await call(`/v2/blog/${postId}`, { method: "PUT", adminKey, body: { title } });
  assert(gone.status === 404, `expected 404 after delete, got ${gone.status}`);

  console.log("LIVE GUIATV CONTRACT: PASS", { slug, postId });
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
