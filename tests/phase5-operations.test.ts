// Phase 5 — operations hardening tests.
//
// Covers the durable publication scheduler (claim atomicity, duplicate
// enqueue protection, delayed/failed/retry semantics), operational
// notification dedupe windows and worker heartbeats.

import test from "node:test";
import { after } from "node:test";
import assert from "node:assert/strict";
import { Queue } from "bullmq";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import {
  claimDuePublications,
  enqueuePublication,
} from "../src/studio/publication";
import { notify } from "../src/studio/notifications";
import { getRedisConnectionOptions } from "../src/infrastructure/queue/redis";
import { closeProducerQueues } from "../src/infrastructure/queue/producer";
import { recordWorkerHeartbeat, listWorkerHeartbeats, markWorkerStopped } from "../src/studio/worker-health";
import { QUEUE_NAMES } from "../src/infrastructure/queue/queues";

// Local Valkey is used for BullMQ; tests remove any jobs they create.
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
}

const prisma = getPrismaClient();

type SchedulerFixture = {
  tenantId: string;
  siteId: string;
  projectId: string;
  versionId: string;
  seed: string;
};

async function createSchedulerFixture(): Promise<SchedulerFixture> {
  const seed = `sched-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-k`), status: "active" },
  });
  const site = await prisma.site.create({
    data: { tenantId: tenant.id, key: `${seed}-site`, name: "Scheduler Site", type: "webhook", locale: "es-ES", baseUrl: "https://example.test" },
  });
  const project = await prisma.contentProject.create({
    data: { tenantId: tenant.id, siteId: site.id, title: "Scheduler project", brief: "brief", goal: "article", primaryLanguage: "es", status: "approved" },
  });
  const version = await prisma.contentVersion.create({
    data: {
      tenantId: tenant.id,
      projectId: project.id,
      versionNumber: 1,
      status: "approved",
      title: "Scheduler version",
      excerpt: "excerpt",
      bodyHtml: "<p>body</p>",
      seoTitle: "SEO",
      seoDescription: "desc",
    },
  });
  return { tenantId: tenant.id, siteId: site.id, projectId: project.id, versionId: version.id, seed };
}

async function createPublication(fixture: SchedulerFixture, overrides: Record<string, unknown> = {}) {
  return prisma.publication.create({
    data: {
      tenantId: fixture.tenantId,
      projectId: fixture.projectId,
      versionId: fixture.versionId,
      channel: "instagram",
      status: "scheduled",
      scheduledFor: new Date(),
      ...overrides,
    },
  });
}

async function cleanupFixture(tenantId: string) {
  await prisma.publicationAttempt.deleteMany({ where: { tenantId } });
  await prisma.publication.deleteMany({ where: { tenantId } });
  await prisma.notification.deleteMany({ where: { tenantId } });
  await prisma.operation.deleteMany({ where: { tenantId } });
  await prisma.contentVersion.deleteMany({ where: { tenantId } });
  await prisma.contentProject.deleteMany({ where: { tenantId } });
  await prisma.site.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

async function clearQueue(queueName: string) {
  const queue = new Queue(queueName, { connection: getRedisConnectionOptions() });
  const jobs = await queue.getJobs(["waiting", "active", "delayed", "failed", "completed", "paused"]);
  for (const job of jobs) {
    await job.remove();
  }
  await queue.close();
}

// Producer queues cache ioredis connections that would otherwise keep the
// test process alive; close them so `node --test` can exit cleanly.
after(async () => {
  await closeProducerQueues();
});

test("claimDuePublications claims only due rows and transitions them to queued", async () => {
  const fixture = await createSchedulerFixture();
  try {
    const due = await createPublication(fixture, { scheduledFor: new Date(Date.now() - 60_000) });
    const future = await createPublication(fixture, { scheduledFor: new Date(Date.now() + 60 * 60_000) });

    const claimed = await claimDuePublications(50);
    assert.ok(claimed.includes(due.id), "due publication must be claimed");
    assert.ok(!claimed.includes(future.id), "future publication must not be claimed");

    const claimedRow = await prisma.publication.findUnique({ where: { id: due.id } });
    assert.equal(claimedRow?.status, "queued");
    const futureRow = await prisma.publication.findUnique({ where: { id: future.id } });
    assert.equal(futureRow?.status, "scheduled");
  } finally {
    await cleanupFixture(fixture.tenantId);
  }
});

test("concurrent scheduler claims never overlap (FOR UPDATE SKIP LOCKED atomicity)", async () => {
  const fixture = await createSchedulerFixture();
  try {
    const created = [];
    for (let i = 0; i < 30; i += 1) {
      created.push(await createPublication(fixture, { scheduledFor: new Date(Date.now() - 60_000) }));
    }

    // Two "scheduler processes" claim in parallel; keep claiming until the
    // fixture rows have all been claimed. Across every round, claims must
    // never overlap and no row may be claimed twice.
    const claimedIds = new Set<string>();
    for (let round = 0; round < 20 && claimedIds.size < created.length; round += 1) {
      const [first, second] = await Promise.all([claimDuePublications(15), claimDuePublications(15)]);
      const overlap = first.filter((id) => second.includes(id));
      assert.equal(overlap.length, 0, "concurrent claims within a round must be disjoint");
      for (const id of [...first, ...second]) {
        assert.ok(!claimedIds.has(id), `publication ${id} claimed twice`);
        claimedIds.add(id);
      }
      if (first.length === 0 && second.length === 0) {
        break;
      }
    }

    for (const row of created) {
      assert.ok(claimedIds.has(row.id), `fixture publication ${row.id} must be claimed exactly once`);
      const claimed = await prisma.publication.findUnique({ where: { id: row.id } });
      assert.equal(claimed?.status, "queued");
    }
  } finally {
    await cleanupFixture(fixture.tenantId);
  }
});

test("failed publication with due nextRetryAt is re-claimed (retry path)", async () => {
  const fixture = await createSchedulerFixture();
  try {
    const failed = await createPublication(fixture, {
      status: "failed",
      scheduledFor: null,
      nextRetryAt: new Date(Date.now() - 10_000),
      retryCount: 1,
    });
    const notDue = await createPublication(fixture, {
      status: "failed",
      scheduledFor: null,
      nextRetryAt: new Date(Date.now() + 60 * 60_000),
      retryCount: 2,
    });

    const claimed = await claimDuePublications(50);
    assert.ok(claimed.includes(failed.id));
    assert.ok(!claimed.includes(notDue.id));

    const row = await prisma.publication.findUnique({ where: { id: failed.id } });
    assert.equal(row?.status, "queued");
  } finally {
    await cleanupFixture(fixture.tenantId);
  }
});

test("duplicate enqueuePublication calls are idempotent for in-flight publications", async () => {
  const fixture = await createSchedulerFixture();
  try {
    const publication = await createPublication(fixture);
    await enqueuePublication(publication.id);

    const attemptsAfterFirst = await prisma.publicationAttempt.count({ where: { publicationId: publication.id } });
    assert.equal(attemptsAfterFirst, 1);

    // Second enqueue must be a no-op: the publication is already publishing.
    await enqueuePublication(publication.id);
    const attemptsAfterSecond = await prisma.publicationAttempt.count({ where: { publicationId: publication.id } });
    assert.equal(attemptsAfterSecond, 1);
  } finally {
    await clearQueue(QUEUE_NAMES.social);
    await cleanupFixture(fixture.tenantId);
  }
});

test("operational notifications respect the dedupe cooldown window", async () => {
  const seed = `notif-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-k`), status: "active" },
  });
  try {
    const base = {
      tenantId: tenant.id,
      category: "operations",
      severity: "warning" as const,
      title: "Queue congested",
      message: "depth high",
      dedupeKey: `ops.queue.test.congested`,
    };

    const first = await notify({ ...base, dedupeWindowMs: 30 * 60_000 });
    assert.ok(first, "first alert is delivered");

    // Within the cooldown window the alert is suppressed (no re-marking).
    const second = await notify({ ...base, dedupeWindowMs: 30 * 60_000 });
    assert.equal(second, null);

    // Without a cooldown window, the existing row is updated and re-surfaced.
    const third = await notify({ ...base, dedupeWindowMs: undefined });
    assert.ok(third, "alert re-surfaces after cooldown semantics change");

    const rows = await prisma.notification.findMany({ where: { tenantId: tenant.id, dedupeKey: base.dedupeKey } });
    assert.equal(rows.length, 1, "one notification row per dedupeKey");
  } finally {
    await prisma.notification.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }
});

test("worker heartbeats record liveness and detect stale workers", async () => {
  const name = `test-worker-${Date.now()}`;
  try {
    await recordWorkerHeartbeat(name, "busy");
    const rows = await listWorkerHeartbeats();
    const row = rows.find((entry) => entry.name === name);
    assert.ok(row, "heartbeat row exists");
    assert.equal(row?.status, "running");
    assert.equal(row?.currentTask, "busy");
    assert.equal(row?.stale, false);

    await markWorkerStopped(name);
    const after = await listWorkerHeartbeats();
    const stopped = after.find((entry) => entry.name === name);
    assert.equal(stopped?.status, "stopped");
  } finally {
    await prisma.workerHeartbeat.deleteMany({ where: { name } });
  }
});
