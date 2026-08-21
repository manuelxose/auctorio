import test from "node:test";
import assert from "node:assert/strict";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { ContentProject, ContentVersion, Site } from "@prisma/client";
import { getPublisher } from "../src/studio/publishers";
import type { PublisherContext } from "../src/studio/types";

const ENV_KEYS = [
  "PUBLISH_DRY_RUN",
  "APP_ENV",
  "NODE_ENV",
  "PUBLISH_TIMEOUT_MS",
  "IMAGE_DOWNLOAD_TIMEOUT_MS",
  "GUIATV_TEST_KEY",
  "TECNORIA_TEST_TOKEN",
  "TECNORIA_TEST_CREDS",
  "TALKARIS_TEST_TOKEN",
  "WEBHOOK_SECRET",
] as const;

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

type MockRequest = {
  method: string;
  path: string;
  headers: IncomingMessage["headers"];
  bodyText: string;
};

type MockServer = {
  url: string;
  close: () => Promise<void>;
  requests: MockRequest[];
};

type MockHandler = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  bodyText: string,
  requests: MockRequest[],
) => void | Promise<void>;

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = originalEnv[key];
  }
}

async function createMockServer(handler: MockHandler): Promise<MockServer> {
  const requests: MockRequest[] = [];
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const bodyText = Buffer.concat(chunks).toString("utf8");
    requests.push({
      method: req.method || "GET",
      path: req.url || "/",
      headers: req.headers,
      bodyText,
    });

    try {
      await handler(req, res, bodyText, requests);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "unexpected_error",
        }),
      );
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("mock_server_address_unavailable");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

function buildContext(siteType: Site["type"], overrides?: Partial<PublisherContext>): PublisherContext {
  const now = new Date();
  const site = {
    id: `${siteType}-site`,
    tenantId: "tenant-1",
    key: `${siteType}-key`,
    name: `${siteType} site`,
    type: siteType,
    locale: "es-ES",
    baseUrl: "https://example.test",
    brandVoice: null,
    seoRules: null,
    taxonomyMap: null,
    publishingCredentialsRef: null,
    createdAt: now,
    updatedAt: now,
  } satisfies Site;

  const project = {
    id: "project-1",
    tenantId: "tenant-1",
    siteId: site.id,
    topicId: null,
    title: "Proyecto test",
    brief: "Brief test",
    goal: "article",
    status: "approved",
    primaryLanguage: "es",
    metadata: {
      slug: "proyecto-test",
      categories: ["streaming", "tv"],
      tags: ["ia", "studio"],
    },
    createdAt: now,
    updatedAt: now,
  } satisfies ContentProject;

  const version = {
    id: "version-1",
    tenantId: "tenant-1",
    projectId: "project-1",
    contentTextId: null,
    contentImageId: null,
    versionNumber: 1,
    status: "approved",
    title: "Titulo",
    excerpt: "Resumen",
    bodyHtml: "<p>Contenido</p>",
    seoTitle: "SEO Titulo",
    seoDescription: "SEO Descripcion",
    qaReport: null,
    feedback: null,
    approvedAt: now,
    approvedBy: "studio",
    approvedByStudioUserId: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  } satisfies ContentVersion;

  const mergedSite = {
    ...site,
    ...(overrides?.site ?? {}),
  };
  const mergedProject = {
    ...project,
    ...(overrides?.project ?? {}),
  };
  const mergedVersion = {
    ...version,
    ...(overrides?.version ?? {}),
    approvedByStudioUserId:
      overrides?.version?.approvedByStudioUserId === undefined
        ? version.approvedByStudioUserId
        : overrides.version.approvedByStudioUserId,
  };

  return {
    ...(overrides ?? {}),
    site: mergedSite,
    project: mergedProject,
    version: mergedVersion,
    assetUrl: overrides?.assetUrl ?? null,
  };
}

test.afterEach(() => {
  restoreEnv();
});

for (const siteType of ["guiatv", "tecnoria", "talkaris", "webhook"] as const) {
  test(`publisher ${siteType} falls back to dry-run when credentials are missing`, async () => {
    process.env["APP_ENV"] = "development";
    process.env["NODE_ENV"] = "development";
    process.env["PUBLISH_DRY_RUN"] = "false";

    const result = await getPublisher(buildContext(siteType).site).publish(buildContext(siteType));
    const responsePayload = result.responsePayload as Record<string, unknown>;

    assert.equal(String(responsePayload["mode"]), "dry_run");
    assert.equal(String(responsePayload["reason"]), "missing_publishing_credentials");
    assert.match(String(result.externalId), /^dryrun-/);
  });

  test(`publisher ${siteType} fails loudly in production when credentials are missing`, async () => {
    process.env["APP_ENV"] = "production";
    process.env["NODE_ENV"] = "production";
    process.env["PUBLISH_DRY_RUN"] = "false";

    await assert.rejects(
      () => getPublisher(buildContext(siteType).site).publish(buildContext(siteType)),
      /publishing_missing_credentials/,
    );
  });
}

test("publisher dry-run can be forced by env even if credentials exist", async () => {
  process.env["APP_ENV"] = "production";
  process.env["NODE_ENV"] = "production";
  process.env["PUBLISH_DRY_RUN"] = "true";
  process.env["GUIATV_TEST_KEY"] = "secret";

  const context = buildContext("guiatv", {
    site: {
      ...buildContext("guiatv").site,
      publishingCredentialsRef: "GUIATV_TEST_KEY",
    },
  });

  const result = await getPublisher(context.site).publish(context);
  const responsePayload = result.responsePayload as Record<string, unknown>;

  assert.equal(String(responsePayload["mode"]), "dry_run");
  assert.equal(String(responsePayload["reason"]), "env_publish_dry_run");
});

test("guiatv supports draft, publish and unpublish flows against the real contract shape", async () => {
  process.env["APP_ENV"] = "production";
  process.env["NODE_ENV"] = "production";
  process.env["PUBLISH_DRY_RUN"] = "false";
  process.env["GUIATV_TEST_KEY"] = "guiatv-secret";

  const server = await createMockServer((req, res, bodyText) => {
    if (req.url === "/blog" && req.method === "POST") {
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      assert.equal(req.headers["x-admin-key"], "guiatv-secret");
      assert.equal(body.status, "draft");
      assert.equal(body.slug, "proyecto-test");
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          data: {
            post: {
              id: "post-1",
              link: "https://guiatv.example/editorial/proyecto-test",
            },
          },
        }),
      );
      return;
    }

    if (req.url === "/blog/post-1" && req.method === "PUT") {
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      assert.equal(req.headers["x-admin-key"], "guiatv-secret");
      assert.equal(body.status, "publish");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          data: {
            post: {
              id: "post-1",
              link: "https://guiatv.example/editorial/proyecto-test",
            },
          },
        }),
      );
      return;
    }

    if (req.url === "/blog/post-1" && req.method === "DELETE") {
      assert.equal(req.headers["x-admin-key"], "guiatv-secret");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          data: {
            deleted: true,
            id: "post-1",
          },
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  try {
    const context = buildContext("guiatv", {
      site: {
        ...buildContext("guiatv").site,
        baseUrl: server.url,
        publishingCredentialsRef: "GUIATV_TEST_KEY",
      },
    });
    const publisher = getPublisher(context.site);

    const draft = await publisher.publishDraft(context);
    assert.equal(draft.externalId, "post-1");
    assert.equal(draft.effectiveTargetStatus, "draft");

    const published = await publisher.publish(context, "post-1");
    assert.equal(published.externalId, "post-1");
    assert.equal(published.effectiveTargetStatus, "publish");

    const deleted = await publisher.unpublish(context, "post-1");
    assert.equal(deleted.externalId, "post-1");
    assert.equal(server.requests.length, 3);
  } finally {
    await server.close();
  }
});

test("guiatv surfaces upstream validation/conflict failures", async () => {
  process.env["APP_ENV"] = "production";
  process.env["NODE_ENV"] = "production";
  process.env["PUBLISH_DRY_RUN"] = "false";
  process.env["GUIATV_TEST_KEY"] = "guiatv-secret";

  const server = await createMockServer((_req, res) => {
    res.statusCode = 409;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "slug_conflict" }));
  });

  try {
    const context = buildContext("guiatv", {
      site: {
        ...buildContext("guiatv").site,
        baseUrl: server.url,
        publishingCredentialsRef: "GUIATV_TEST_KEY",
      },
    });

    await assert.rejects(
      () => getPublisher(context.site).publishDraft(context),
      /http_error status=409 body=\{"error":"slug_conflict"\}/,
    );
  } finally {
    await server.close();
  }
});

test("tecnoria publishes with bearer token and image upload", async () => {
  process.env["APP_ENV"] = "production";
  process.env["NODE_ENV"] = "production";
  process.env["PUBLISH_DRY_RUN"] = "false";
  process.env["TECNORIA_TEST_TOKEN"] = "tecnoria-token";
  process.env["IMAGE_DOWNLOAD_TIMEOUT_MS"] = "1000";

  const server = await createMockServer((req, res, bodyText) => {
    if (req.url === "/assets/generated.png" && req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("content-type", "image/png");
      res.end(Buffer.from("png"));
      return;
    }

    if (req.url === "/api/v1/blog/upload-image" && req.method === "POST") {
      assert.equal(req.headers.authorization, "Bearer tecnoria-token");
      assert.match(String(req.headers["content-type"]), /multipart\/form-data/);
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ url: "/uploads/blog/generated.png" }));
      return;
    }

    if (req.url === "/api/v1/blog" && req.method === "POST") {
      assert.equal(req.headers.authorization, "Bearer tecnoria-token");
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      assert.equal(body.slug, "proyecto-test");
      assert.equal(body.image, "/uploads/blog/generated.png");
      assert.equal(body.status, "publish");
      assert.equal(body.seoTitle, "SEO Titulo");
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "42", slug: "proyecto-test", status: "publish" }));
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  try {
    const context = buildContext("tecnoria", {
      site: {
        ...buildContext("tecnoria").site,
        baseUrl: server.url,
        publishingCredentialsRef: "TECNORIA_TEST_TOKEN",
      },
      assetUrl: `${server.url}/assets/generated.png`,
    });

    const result = await getPublisher(context.site).publish(context);
    assert.equal(result.externalId, "42");
    assert.equal(result.effectiveTargetStatus, "publish");
    assert.equal(result.externalUrl, `${server.url}/blog/proyecto-test`);
  } finally {
    await server.close();
  }
});

test("tecnoria unpublish downgrades the remote article to draft", async () => {
  process.env["APP_ENV"] = "production";
  process.env["NODE_ENV"] = "production";
  process.env["PUBLISH_DRY_RUN"] = "false";
  process.env["TECNORIA_TEST_TOKEN"] = "tecnoria-token";

  const server = await createMockServer((req, res, bodyText) => {
    if (req.url === "/api/v1/blog/42" && req.method === "PUT") {
      assert.equal(req.headers.authorization, "Bearer tecnoria-token");
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      assert.equal(body.status, "draft");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "42", slug: "proyecto-test", status: "draft" }));
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  try {
    const context = buildContext("tecnoria", {
      site: {
        ...buildContext("tecnoria").site,
        baseUrl: server.url,
        publishingCredentialsRef: "TECNORIA_TEST_TOKEN",
      },
    });

    const result = await getPublisher(context.site).unpublish(context, "42");
    assert.equal(result.externalId, "42");
  } finally {
    await server.close();
  }
});

test("tecnoria surfaces 401 login failures", async () => {
  process.env["APP_ENV"] = "production";
  process.env["NODE_ENV"] = "production";
  process.env["PUBLISH_DRY_RUN"] = "false";
  process.env["TECNORIA_TEST_CREDS"] = JSON.stringify({
    email: "admin@example.test",
    password: "secret",
  });

  const server = await createMockServer((_req, res) => {
    res.statusCode = 401;
    res.end("bad credentials");
  });

  try {
    const context = buildContext("tecnoria", {
      site: {
        ...buildContext("tecnoria").site,
        baseUrl: server.url,
        publishingCredentialsRef: "TECNORIA_TEST_CREDS",
      },
    });

    await assert.rejects(
      () => getPublisher(context.site).publish(context),
      /tecnoria_login_failed status=401 body=bad credentials/,
    );
  } finally {
    await server.close();
  }
});

test("tecnoria surfaces partial upload failures before publishing", async () => {
  process.env["APP_ENV"] = "production";
  process.env["NODE_ENV"] = "production";
  process.env["PUBLISH_DRY_RUN"] = "false";
  process.env["TECNORIA_TEST_TOKEN"] = "tecnoria-token";

  const server = await createMockServer((req, res) => {
    if (req.url === "/assets/generated.png" && req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("content-type", "image/png");
      res.end(Buffer.from("png"));
      return;
    }

    if (req.url === "/api/v1/blog/upload-image" && req.method === "POST") {
      res.statusCode = 422;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ code: "INVALID_IMAGE" }));
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  try {
    const context = buildContext("tecnoria", {
      site: {
        ...buildContext("tecnoria").site,
        baseUrl: server.url,
        publishingCredentialsRef: "TECNORIA_TEST_TOKEN",
      },
      assetUrl: `${server.url}/assets/generated.png`,
    });

    await assert.rejects(
      () => getPublisher(context.site).publish(context),
      /http_error status=422 body=\{"code":"INVALID_IMAGE"\}/,
    );
  } finally {
    await server.close();
  }
});

test("talkaris publishes with bearer token and preserves SEO fields", async () => {
  process.env["APP_ENV"] = "production";
  process.env["NODE_ENV"] = "production";
  process.env["PUBLISH_DRY_RUN"] = "false";
  process.env["TALKARIS_TEST_TOKEN"] = "talkaris-token";

  const server = await createMockServer((req, res, bodyText) => {
    if (req.url === "/api/v1/ops/blog" && req.method === "POST") {
      assert.equal(req.headers.authorization, "Bearer talkaris-token");
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      assert.equal(body.slug, "proyecto-test");
      assert.equal(body.status, "publish");
      assert.equal(body.seoDescription, "SEO Descripcion");
      assert.equal(body.imageUrl, "https://auctorio.example/assets/image.webp");
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "talkaris-1", slug: "proyecto-test", status: "publish" }));
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  try {
    const context = buildContext("talkaris", {
      site: {
        ...buildContext("talkaris").site,
        baseUrl: server.url,
        publishingCredentialsRef: "TALKARIS_TEST_TOKEN",
      },
      assetUrl: "https://auctorio.example/assets/image.webp",
    });

    const result = await getPublisher(context.site).publish(context);
    assert.equal(result.externalId, "talkaris-1");
    assert.equal(result.externalUrl, `${server.url}/blog/proyecto-test`);
    assert.equal(result.effectiveTargetStatus, "publish");
  } finally {
    await server.close();
  }
});

test("talkaris draft sync and unpublish use the same remote record id", async () => {
  process.env["APP_ENV"] = "production";
  process.env["NODE_ENV"] = "production";
  process.env["PUBLISH_DRY_RUN"] = "false";
  process.env["TALKARIS_TEST_TOKEN"] = "talkaris-token";

  const seen: Array<{ method: string; status: string }> = [];
  const server = await createMockServer((req, res, bodyText) => {
    if (req.url === "/api/v1/ops/blog/talkaris-1" && req.method === "PUT") {
      const body = JSON.parse(bodyText) as Record<string, unknown>;
      seen.push({ method: "PUT", status: String(body.status) });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "talkaris-1", slug: "proyecto-test", status: body.status }));
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  try {
    const context = buildContext("talkaris", {
      site: {
        ...buildContext("talkaris").site,
        baseUrl: server.url,
        publishingCredentialsRef: "TALKARIS_TEST_TOKEN",
      },
    });

    const publisher = getPublisher(context.site);
    const draft = await publisher.updateDraft(context, "talkaris-1");
    const unpublished = await publisher.unpublish(context, "talkaris-1");

    assert.equal(draft.effectiveTargetStatus, "draft");
    assert.equal(unpublished.externalId, "talkaris-1");
    assert.deepEqual(seen, [
      { method: "PUT", status: "draft" },
      { method: "PUT", status: "draft" },
    ]);
  } finally {
    await server.close();
  }
});

test("webhook publisher signs the payload and preserves draft target status", async () => {
  process.env["APP_ENV"] = "production";
  process.env["NODE_ENV"] = "production";
  process.env["PUBLISH_DRY_RUN"] = "false";
  process.env["WEBHOOK_SECRET"] = "super-secret";

  const server = await createMockServer((req, res, bodyText) => {
    const body = JSON.parse(bodyText) as Record<string, unknown>;
    const publication = body.publication as Record<string, unknown>;
    assert.equal(publication.targetStatus, "draft");
    assert.equal(publication.action, "publishDraft");
    assert.ok(req.headers["x-content-signature"]);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "webhook-1", url: "https://consumer.example/items/1" }));
  });

  try {
    const context = buildContext("webhook", {
      site: {
        ...buildContext("webhook").site,
        baseUrl: server.url,
        publishingCredentialsRef: "WEBHOOK_SECRET",
      },
    });

    const result = await getPublisher(context.site).publishDraft(context);
    assert.equal(result.externalId, "webhook-1");
    assert.equal(result.effectiveTargetStatus, "draft");
  } finally {
    await server.close();
  }
});

test("webhook publisher surfaces timeout failures", async () => {
  process.env["APP_ENV"] = "production";
  process.env["NODE_ENV"] = "production";
  process.env["PUBLISH_DRY_RUN"] = "false";
  process.env["PUBLISH_TIMEOUT_MS"] = "25";
  process.env["WEBHOOK_SECRET"] = "super-secret";

  const server = await createMockServer(async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "slow-webhook" }));
  });

  try {
    const context = buildContext("webhook", {
      site: {
        ...buildContext("webhook").site,
        baseUrl: server.url,
        publishingCredentialsRef: "WEBHOOK_SECRET",
      },
    });

    await assert.rejects(() => getPublisher(context.site).publish(context));
  } finally {
    await server.close();
  }
});
