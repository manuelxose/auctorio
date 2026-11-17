import test from "node:test";
import assert from "node:assert/strict";
import type { PublishResult, PublisherAdapter } from "../src/studio/types";
import { processPublishingJob } from "../src/infrastructure/workers/worker-publishing";

const JOB = { attemptId: "attempt-1", publicationId: "publication-1" };

function buildPublication(overrides?: Record<string, unknown>) {
  const now = new Date();
  return {
    id: "publication-1",
    tenantId: "tenant-1",
    siteId: "site-1",
    projectId: "project-1",
    versionId: "version-1",
    channel: "website",
    status: "publishing",
    externalId: null,
    externalUrl: null,
    metadata: { targetStatus: "publish", unpublishRequested: false },
    createdAt: now,
    updatedAt: now,
    site: {
      id: "site-1",
      tenantId: "tenant-1",
      key: "site-key",
      name: "Site",
      type: "guiatv",
      locale: "es-ES",
      baseUrl: "https://example.test",
      brandVoice: null,
      seoRules: null,
      taxonomyMap: null,
      publishingCredentialsRef: null,
      createdAt: now,
      updatedAt: now,
    },
    project: { id: "project-1", tenantId: "tenant-1", siteId: "site-1", title: "Proyecto", status: "approved", createdAt: now, updatedAt: now },
    version: {
      id: "version-1",
      tenantId: "tenant-1",
      projectId: "project-1",
      versionNumber: 1,
      status: "approved",
      title: "Titulo",
      bodyHtml: "<p>Contenido</p>",
      contentImage: null,
      contentText: null,
      derivatives: [],
    },
    ...overrides,
  };
}

function buildPublisher(overrides?: Partial<PublisherAdapter>): PublisherAdapter {
  const defaultResult: PublishResult = {
    externalId: "remote-1",
    externalUrl: "https://remote.example/items/1",
    effectiveTargetStatus: "publish",
    responsePayload: { ok: true },
  };
  return {
    publishDraft: async () => ({ ...defaultResult, effectiveTargetStatus: "draft" }),
    updateDraft: async () => ({ ...defaultResult, effectiveTargetStatus: "draft" }),
    publish: async () => defaultResult,
    unpublish: async () => ({ externalId: "remote-1", responsePayload: { ok: true } }),
    ...overrides,
  };
}

function dependencies(
  publication: ReturnType<typeof buildPublication>,
  calls: string[],
  options: { latestExternalId?: string | null; publisher?: Partial<PublisherAdapter> } = {},
) {
  return {
    loadPublication: async () => publication as never,
    startAttempt: async () => {
      calls.push("attempt:running");
    },
    succeedAttempt: async (_tenantId: string, _attemptId: string, input: { externalId?: string | null; draft?: boolean }) => {
      calls.push(`attempt:succeeded${input.draft ? ":draft" : ""}:${input.externalId ?? "none"}`);
      return null;
    },
    recordExternalId: async (_id: string, externalId: string) => {
      calls.push(`record:${externalId}`);
    },
    getLatestPublishedExternalId: async () => options.latestExternalId ?? null,
    buildAssetPublicUrl: async () => null,
    getPublisher: () => buildPublisher(options.publisher),
    markProjectPublished: async () => {
      calls.push("mark-published");
      return {} as never;
    },
    clearProjectPublicationState: async () => {
      calls.push("clear-published");
      return {} as never;
    },
    verifyWebsitePublication: async () => {
      calls.push("verify");
      return { ok: true, detail: "unused", externalId: null, externalUrl: null, checkedAt: new Date().toISOString() } as never;
    },
  };
}

test("processPublishingJob publishes, marks the project published and verifies the post", async () => {
  const calls: string[] = [];
  await processPublishingJob(JOB, dependencies(buildPublication(), calls));
  assert.deepEqual(calls, ["attempt:running", "attempt:succeeded:remote-1", "mark-published", "verify"]);
});

test("processPublishingJob uses publishDraft and keeps the project approved when syncing a draft", async () => {
  const calls: string[] = [];
  await processPublishingJob(JOB, dependencies(buildPublication({ metadata: { targetStatus: "draft" } }), calls));
  assert.deepEqual(calls, ["attempt:running", "attempt:succeeded:draft:remote-1", "clear-published"]);
});

test("processPublishingJob upgrades to published when the provider cannot keep a draft", async () => {
  const calls: string[] = [];
  await processPublishingJob(
    JOB,
    dependencies(buildPublication({ metadata: { targetStatus: "draft" } }), calls, {
      latestExternalId: "remote-1",
      publisher: {
        updateDraft: async () => ({ externalId: "remote-1", externalUrl: "https://remote.example/items/1", effectiveTargetStatus: "publish", responsePayload: {} }),
      },
    }),
  );
  assert.deepEqual(calls, ["attempt:running", "attempt:succeeded:remote-1", "mark-published", "verify"]);
});

test("processPublishingJob calls unpublish with the earlier delivery's id and clears published state", async () => {
  const calls: string[] = [];
  await processPublishingJob(
    JOB,
    dependencies(buildPublication({ metadata: { unpublishRequested: true } }), calls, {
      latestExternalId: "remote-1",
      publisher: {
        unpublish: async (_context, externalId) => {
          calls.push(`unpublish:${externalId}`);
          return { externalId, responsePayload: { deleted: true } };
        },
      },
    }),
  );
  assert.deepEqual(calls, ["attempt:running", "unpublish:remote-1", "attempt:succeeded:remote-1", "clear-published"]);
});

test("processPublishingJob keeps a remote id from a failed attempt and reuses it on retry", async () => {
  const calls: string[] = [];
  const publishedWith: Array<string | null | undefined> = [];

  await assert.rejects(
    processPublishingJob(
      JOB,
      dependencies(buildPublication(), calls, {
        publisher: {
          publish: async (_context, externalId) => {
            publishedWith.push(externalId);
            throw Object.assign(new Error("http_error status=503"), { externalId: "remote-draft-9" });
          },
        },
      }),
    ),
    /status=503/,
  );
  assert.ok(calls.includes("record:remote-draft-9"));

  // The retry reads the persisted id from the publication row: publish finishes that post.
  await processPublishingJob(
    JOB,
    dependencies(buildPublication({ externalId: "remote-draft-9" }), calls, {
      publisher: {
        publish: async (_context, externalId) => {
          publishedWith.push(externalId);
          return { externalId: externalId ?? null, externalUrl: "https://remote.example/items/9", effectiveTargetStatus: "publish", responsePayload: {} };
        },
      },
    }),
  );
  assert.deepEqual(publishedWith, [null, "remote-draft-9"]);
});

test("processPublishingJob never updates a dry-run id: a real delivery after a simulated one creates the post", async () => {
  const calls: string[] = [];
  const updated: string[] = [];
  await processPublishingJob(
    JOB,
    dependencies(buildPublication({ externalId: "dryrun-f1ac075fcb4b50de", metadata: { targetStatus: "draft" } }), calls, {
      publisher: {
        updateDraft: async (_context, externalId) => {
          updated.push(externalId);
          return { externalId, responsePayload: {} };
        },
      },
    }),
  );
  assert.deepEqual(updated, []);
  assert.deepEqual(calls, ["attempt:running", "attempt:succeeded:draft:remote-1", "clear-published"]);
});
