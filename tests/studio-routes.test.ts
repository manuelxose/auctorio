import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { registerStudioRoutes } from "../src/studio/routes";

const prisma = getPrismaClient();

type Fixture = {
  apiKey: string;
  tenantId: string;
  siteId: string;
  projectId: string;
  versionId: string;
};

async function createFixture(): Promise<Fixture> {
  const seed = `studio-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const apiKey = `${seed}-key`;
  const tenant = await prisma.tenant.create({
    data: {
      name: seed,
      apiKeyHash: sha256(apiKey),
      status: "active",
    },
  });

  const site = await prisma.site.create({
    data: {
      tenantId: tenant.id,
      key: `${seed}-site`,
      name: "Studio Test Site",
      type: "webhook",
      locale: "es-ES",
      baseUrl: "https://example.test",
    },
  });

  const project = await prisma.contentProject.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      title: "Proyecto de prueba",
      brief: "Brief de prueba para los listados del studio",
      goal: "article",
      primaryLanguage: "es",
      status: "draft",
    },
  });

  const version = await prisma.contentVersion.create({
    data: {
      tenantId: tenant.id,
      projectId: project.id,
      versionNumber: 1,
      status: "draft",
      title: "Version inicial",
      excerpt: "Resumen inicial",
      bodyHtml: "<p>Contenido de prueba suficientemente largo para el listado.</p>",
      seoTitle: "SEO Version inicial",
      seoDescription: "Descripcion SEO inicial",
    },
  });

  return {
    apiKey,
    tenantId: tenant.id,
    siteId: site.id,
    projectId: project.id,
    versionId: version.id,
  };
}

async function cleanupFixture(tenantId: string) {
  await prisma.publicationJob.deleteMany({ where: { tenantId } });
  await prisma.contentDerivative.deleteMany({ where: { tenantId } });
  await prisma.contentVersion.deleteMany({ where: { tenantId } });
  await prisma.contentProject.deleteMany({ where: { tenantId } });
  await prisma.assetVariant.deleteMany({ where: { tenantId } });
  await prisma.contentImage.deleteMany({ where: { tenantId } });
  await prisma.contentText.deleteMany({ where: { tenantId } });
  await prisma.fact.deleteMany({ where: { tenantId } });
  await prisma.topic.deleteMany({ where: { tenantId } });
  await prisma.site.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

function buildStudioTestServer(tenantId: string) {
  const server = Fastify();
  server.decorateRequest("tenantId", "");
  server.addHook("preHandler", async (request) => {
    request.tenantId = tenantId;
  });
  registerStudioRoutes(server);
  return server;
}

test.after(async () => {
  await prisma.$disconnect();
});

test("GET /v2/sites returns paginated site summaries", async () => {
  const fixture = await createFixture();
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    const response = await server.inject({
      method: "GET",
      url: "/v2/sites?page=1&pageSize=10",
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as {
      items: Array<{
        id: string;
        key: string;
        projectCount: number;
      }>;
      total: number;
    };

    assert.equal(payload.total, 1);
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0]?.id, fixture.siteId);
    assert.equal(payload.items[0]?.projectCount, 1);
  } finally {
    await server.close();
    await cleanupFixture(fixture.tenantId);
  }
});

test("DELETE /v2/media/:id removes an unused asset and preserves the audit contract", async () => {
  const fixture = await createFixture();
  const topic = await prisma.topic.create({
    data: {
      tenantId: fixture.tenantId,
      title: "Media test topic",
      description: "Topic for media deletion coverage",
      status: "active",
    },
  });
  const image = await prisma.contentImage.create({
    data: {
      tenantId: fixture.tenantId,
      topicId: topic.id,
      status: "done",
    },
  });
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    const response = await server.inject({
      method: "DELETE",
      url: `/v2/media/${image.id}`,
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true });
    assert.equal(await prisma.contentImage.findUnique({ where: { id: image.id } }), null);
    assert.equal(
      await prisma.auditLog.count({
        where: { tenantId: fixture.tenantId, action: "media.deleted", entityId: image.id },
      }),
      1,
    );
  } finally {
    await server.close();
    await cleanupFixture(fixture.tenantId);
  }
});

test("DELETE /v2/media/:id refuses an asset still used by content", async () => {
  const fixture = await createFixture();
  const topic = await prisma.topic.create({
    data: {
      tenantId: fixture.tenantId,
      title: "In-use media topic",
      description: "Topic for media protection coverage",
      status: "active",
    },
  });
  const image = await prisma.contentImage.create({
    data: { tenantId: fixture.tenantId, topicId: topic.id, status: "done" },
  });
  await prisma.contentVersion.update({
    where: { id: fixture.versionId },
    data: { contentImageId: image.id },
  });
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    const response = await server.inject({ method: "DELETE", url: `/v2/media/${image.id}` });

    assert.equal(response.statusCode, 409);
    assert.match(response.json().error.message, /used by 1 version/);
    assert.ok(await prisma.contentImage.findUnique({ where: { id: image.id } }));
  } finally {
    await server.close();
    await cleanupFixture(fixture.tenantId);
  }
});

test("publishing accounts expose real state and never credential references", async () => {
  const fixture = await createFixture();
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    const created = await server.inject({
      method: "POST",
      url: "/v2/publishing-accounts",
      payload: {
        platform: "website",
        displayName: "QA website",
        credentialsRef: "QA_SECRET_REF",
        siteId: fixture.siteId,
      },
    });
    assert.equal(created.statusCode, 201);
    const createdBody = created.json();
    assert.equal(createdBody.status, "pending");
    assert.equal(createdBody.hasCredentials, true);
    assert.equal(createdBody.credentialsRef, undefined);

    const listed = await server.inject({ method: "GET", url: "/v2/publishing-accounts" });
    assert.equal(listed.statusCode, 200);
    const listBody = listed.json() as { items: Array<Record<string, unknown>> };
    const found = listBody.items.find((item) => item.id === createdBody.id);
    assert.ok(found);
    assert.equal(found.hasCredentials, true);
    assert.equal(found.credentialsRef, undefined);
    assert.equal(JSON.stringify(found).includes("QA_SECRET_REF"), false);

    const removed = await server.inject({ method: "DELETE", url: `/v2/publishing-accounts/${createdBody.id}` });
    assert.equal(removed.statusCode, 200);
    assert.equal(
      await prisma.publishingAccount.count({ where: { tenantId: fixture.tenantId } }),
      0,
    );
  } finally {
    await server.close();
    await cleanupFixture(fixture.tenantId);
  }
});

test("GET /v2/projects returns filtered project summaries", async () => {
  const fixture = await createFixture();
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    const response = await server.inject({
      method: "GET",
      url: `/v2/projects?siteId=${fixture.siteId}&status=draft&page=1&pageSize=10`,
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as {
      items: Array<{
        id: string;
        site: { id: string; key: string };
        versionCount: number;
        reviewGate: {
          stage: string;
          compareReady: boolean;
          blockerCount: number;
        };
        latestVersion: {
          title: string | null;
          wordCount: number;
          qaFailureCount: number;
          qaWarningCount: number;
        } | null;
      }>;
      total: number;
    };

    assert.equal(payload.total, 1);
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0]?.id, fixture.projectId);
    assert.equal(payload.items[0]?.site.id, fixture.siteId);
    assert.equal(payload.items[0]?.versionCount, 1);
    assert.equal(payload.items[0]?.reviewGate.stage, "needs_review");
    assert.equal(payload.items[0]?.reviewGate.compareReady, false);
    assert.equal(payload.items[0]?.reviewGate.blockerCount, 2);
    assert.equal(payload.items[0]?.latestVersion?.title, "Version inicial");
    assert.equal(payload.items[0]?.latestVersion?.wordCount, 8);
    assert.equal(payload.items[0]?.latestVersion?.qaFailureCount, 0);
    assert.equal(payload.items[0]?.latestVersion?.qaWarningCount, 0);
  } finally {
    await server.close();
    await cleanupFixture(fixture.tenantId);
  }
});

test("Editorial plan bulk operations approve, reject and delete rows", async () => {
  const fixture = await createFixture();
  const plan = await prisma.editorialPlan.create({
    data: {
      tenantId: fixture.tenantId,
      siteId: fixture.siteId,
      name: "Bulk plan test",
      dateFrom: new Date("2026-08-22T00:00:00.000Z"),
      dateTo: new Date("2026-08-29T00:00:00.000Z"),
      status: "ready",
    },
  });
  const items = await Promise.all([
    prisma.editorialPlanItem.create({
      data: { tenantId: fixture.tenantId, planId: plan.id, siteId: fixture.siteId, title: "Row one", channel: "website", scheduledFor: new Date("2026-08-23T10:00:00.000Z") },
    }),
    prisma.editorialPlanItem.create({
      data: { tenantId: fixture.tenantId, planId: plan.id, siteId: fixture.siteId, title: "Row two", channel: "x", scheduledFor: new Date("2026-08-23T11:00:00.000Z") },
    }),
  ]);
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    const approved = await server.inject({
      method: "POST",
      url: "/v2/editorial-plan-items/bulk-approve",
      payload: { itemIds: items.map((item) => item.id) },
    });
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.json().updatedCount, 2);

    const rejected = await server.inject({
      method: "POST",
      url: "/v2/editorial-plan-items/bulk-status",
      payload: { itemIds: [items[1].id], status: "rejected" },
    });
    assert.equal(rejected.statusCode, 200);
    assert.equal(rejected.json().updatedCount, 1);
    assert.equal((await prisma.editorialPlanItem.findUnique({ where: { id: items[1].id } }))?.status, "rejected");

    const deleted = await server.inject({
      method: "POST",
      url: "/v2/editorial-plan-items/bulk-delete",
      payload: { itemIds: items.map((item) => item.id) },
    });
    assert.equal(deleted.statusCode, 200);
    assert.equal(deleted.json().deletedCount, 2);
    assert.equal(await prisma.editorialPlanItem.count({ where: { tenantId: fixture.tenantId } }), 0);
  } finally {
    await server.close();
    await prisma.editorialPlanItem.deleteMany({ where: { tenantId: fixture.tenantId } });
    await prisma.editorialPlan.deleteMany({ where: { tenantId: fixture.tenantId } });
    await cleanupFixture(fixture.tenantId);
  }
});

test("Editorial plan rows can be approved, edited and deleted without creating content", async () => {
  const fixture = await createFixture();
  const plan = await prisma.editorialPlan.create({
    data: {
      tenantId: fixture.tenantId,
      siteId: fixture.siteId,
      name: "Plan test",
      dateFrom: new Date("2026-08-22T00:00:00.000Z"),
      dateTo: new Date("2026-08-29T00:00:00.000Z"),
      status: "ready",
    },
  });
  const item = await prisma.editorialPlanItem.create({
    data: {
      tenantId: fixture.tenantId,
      planId: plan.id,
      siteId: fixture.siteId,
      title: "Plan item",
      channel: "website",
      scheduledFor: new Date("2026-08-23T10:00:00.000Z"),
    },
  });
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    const edited = await server.inject({
      method: "PATCH",
      url: `/v2/editorial-plan-items/${item.id}`,
      payload: { title: "Edited plan item", primaryKeyword: "editorial workflow" },
    });
    assert.equal(edited.statusCode, 200);
    assert.equal(edited.json().title, "Edited plan item");

    const approved = await server.inject({ method: "POST", url: `/v2/editorial-plan-items/${item.id}/approve` });
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.json().status, "approved");
    assert.equal(await prisma.contentProject.count({ where: { tenantId: fixture.tenantId } }), 1);

    const deleted = await server.inject({ method: "DELETE", url: `/v2/editorial-plan-items/${item.id}` });
    assert.equal(deleted.statusCode, 200);
    assert.equal(await prisma.editorialPlanItem.findUnique({ where: { id: item.id } }), null);
  } finally {
    await server.close();
    await prisma.editorialPlanItem.deleteMany({ where: { tenantId: fixture.tenantId } });
    await prisma.editorialPlan.deleteMany({ where: { tenantId: fixture.tenantId } });
    await cleanupFixture(fixture.tenantId);
  }
});

test("GET /v2/projects/:id returns review gate and version insights", async () => {
  const fixture = await createFixture();
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    const response = await server.inject({
      method: "GET",
      url: `/v2/projects/${fixture.projectId}`,
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as {
      id: string;
      versionCount: number;
      reviewGate: {
        stage: string;
        blockers: string[];
        warnings: string[];
      };
      versions: Array<{
        versionNumber: number;
        wordCount: number;
        qaFailureCount: number;
      }>;
    };

    assert.equal(payload.id, fixture.projectId);
    assert.equal(payload.versionCount, 1);
    assert.equal(payload.reviewGate.stage, "needs_review");
    assert.equal(payload.reviewGate.blockers.length, 2);
    assert.equal(payload.reviewGate.warnings.length, 1);
    assert.equal(payload.versions[0]?.versionNumber, 1);
    assert.equal(payload.versions[0]?.wordCount, 8);
    assert.equal(payload.versions[0]?.qaFailureCount, 0);
  } finally {
    await server.close();
    await cleanupFixture(fixture.tenantId);
  }
});

test("POST /v2/projects/:id/duplicate copies the project and latest version", async () => {
  const fixture = await createFixture();
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    const response = await server.inject({
      method: "POST",
      url: `/v2/projects/${fixture.projectId}/duplicate`,
    });

    assert.equal(response.statusCode, 201);
    const duplicateId = (response.json() as { id: string }).id;
    const duplicate = await prisma.contentProject.findUnique({
      where: { id: duplicateId },
      include: { versions: true },
    });
    assert.ok(duplicate);
    assert.ok(duplicate.title.endsWith("(copy)"));
    assert.equal(duplicate.brief, "Brief de prueba para los listados del studio");
    assert.equal(duplicate.versions.length, 1);
    assert.equal(duplicate.versions[0]?.bodyHtml, "<p>Contenido de prueba suficientemente largo para el listado.</p>");
    assert.equal(
      await prisma.auditLog.count({
        where: { tenantId: fixture.tenantId, action: "project.duplicated", entityId: duplicateId },
      }),
      1,
    );
  } finally {
    await server.close();
    await cleanupFixture(fixture.tenantId);
  }
});

test("PUT /v2/projects/:id updates the editorial brief payload", async () => {
  const fixture = await createFixture();
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    const response = await server.inject({
      method: "PUT",
      url: `/v2/projects/${fixture.projectId}`,
      payload: {
        title: "Proyecto reencuadrado",
        brief: "Brief reescrito con nueva estrategia editorial",
        primaryLanguage: "en",
        metadata: {
          targetQuery: "enterprise editorial workflow",
          keywords: ["editorial cockpit", "content ops"],
          featured: true,
        },
      },
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as {
      id: string;
      title: string;
      brief: string;
      primaryLanguage: string;
      metadata: {
        targetQuery?: string;
        keywords?: string[];
        featured?: boolean;
      } | null;
    };

    assert.equal(payload.id, fixture.projectId);
    assert.equal(payload.title, "Proyecto reencuadrado");
    assert.equal(payload.brief, "Brief reescrito con nueva estrategia editorial");
    assert.equal(payload.primaryLanguage, "en");
    assert.equal(payload.metadata?.targetQuery, "enterprise editorial workflow");
    assert.deepEqual(payload.metadata?.keywords, ["editorial cockpit", "content ops"]);
    assert.equal(payload.metadata?.featured, true);
  } finally {
    await server.close();
    await cleanupFixture(fixture.tenantId);
  }
});

test("GET /v2/session/me returns tenant session summary", async () => {
  const fixture = await createFixture();
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    const response = await server.inject({
      method: "GET",
      url: "/v2/session/me",
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as {
      tenant: { id: string; name: string; status: string };
      siteCount: number;
      projectCount: number;
    };

    assert.equal(payload.tenant.id, fixture.tenantId);
    assert.equal(payload.siteCount, 1);
    assert.equal(payload.projectCount, 1);
  } finally {
    await server.close();
    await cleanupFixture(fixture.tenantId);
  }
});

test("POST /v2/projects/:id/approve rejects versions that look qa_passed but still fail the review gate", async () => {
  const fixture = await createFixture();
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    await prisma.contentVersion.update({
      where: { id: fixture.versionId },
      data: {
        status: "qa_passed",
      },
    });
    await prisma.contentProject.update({
      where: { id: fixture.projectId },
      data: {
        status: "qa_passed",
      },
    });

    const response = await server.inject({
      method: "POST",
      url: `/v2/projects/${fixture.projectId}/approve`,
    });

    assert.equal(response.statusCode, 400);
    const payload = response.json() as { error: { code: string; message: string; requestId: string | null } };
    assert.equal(payload.error.code, "bad_request");
    assert.equal(payload.error.message, "Featured image is still missing.");
    assert.ok(payload.error.requestId);
  } finally {
    await server.close();
    await cleanupFixture(fixture.tenantId);
  }
});

test("POST /v2/projects/:id/publish rejects approved versions when gate blockers remain", async () => {
  const fixture = await createFixture();
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    await prisma.contentVersion.update({
      where: { id: fixture.versionId },
      data: {
        status: "approved",
      },
    });
    await prisma.contentProject.update({
      where: { id: fixture.projectId },
      data: {
        status: "approved",
      },
    });

    const response = await server.inject({
      method: "POST",
      url: `/v2/projects/${fixture.projectId}/publish`,
      payload: {
        action: "publish",
        targetStatus: "publish",
      },
    });

    assert.equal(response.statusCode, 400);
    const payload = response.json() as { error: { code: string; message: string; requestId: string | null } };
    assert.equal(payload.error.code, "bad_request");
    assert.equal(payload.error.message, "Featured image is still missing.");
    assert.ok(payload.error.requestId);
  } finally {
    await server.close();
    await cleanupFixture(fixture.tenantId);
  }
});
