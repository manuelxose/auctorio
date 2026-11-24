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
  createPublication as createPublicationRecord,
  enqueuePublication,
  recoverStalledPublications,
} from "../src/studio/publication";
import { getPublicationReleaseReadiness } from "../src/studio/release-readiness";
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
  accountId: string;
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
  const account = await prisma.publishingAccount.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      platform: "instagram",
      displayName: "Scheduler test account",
      provider: "legacy",
      credentialsCiphertext: "test-fixture-ciphertext",
      connectionStatus: "connected",
      status: "active",
    },
  });
  return { tenantId: tenant.id, siteId: site.id, accountId: account.id, projectId: project.id, versionId: version.id, seed };
}

async function createPublication(fixture: SchedulerFixture, overrides: Record<string, unknown> = {}) {
  return prisma.publication.create({
    data: {
      tenantId: fixture.tenantId,
      projectId: fixture.projectId,
      versionId: fixture.versionId,
      accountId: fixture.accountId,
      channel: "instagram",
      status: "scheduled",
      scheduledFor: new Date(),
      // This fixture exercises queue idempotency, not autonomous release
      // authorization. Manual releases bypass the autopilot readiness gate.
      manualOverride: true,
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

async function removeFixtureSocialJobs(tenantId: string) {
  const attempts = await prisma.publicationAttempt.findMany({
    where: { tenantId },
    select: { id: true },
  });
  const queue = new Queue(QUEUE_NAMES.social, { connection: getRedisConnectionOptions() });
  try {
    for (const { id } of attempts) {
      const job = await queue.getJob(id);
      await job?.remove();
    }
  } finally {
    await queue.close();
  }
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
    await removeFixtureSocialJobs(fixture.tenantId);
    await cleanupFixture(fixture.tenantId);
  }
});

test("automatic releases are blocked before queueing when autopilot readiness is missing", async () => {
  const fixture = await createSchedulerFixture();
  try {
    const publication = await createPublication(fixture, { manualOverride: false });
    await assert.rejects(() => enqueuePublication(publication.id), /release_blocked:automation_policy_missing/);
    const after = await prisma.publication.findUniqueOrThrow({ where: { id: publication.id } });
    assert.equal(after.status, "scheduled");
    assert.equal(await prisma.publicationAttempt.count({ where: { publicationId: publication.id } }), 0);
  } finally {
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

test("manual scheduling of the same content and destination keeps one canonical publication", async () => {
  const fixture = await createSchedulerFixture();
  try {
    const input = { tenantId: fixture.tenantId, projectId: fixture.projectId, versionId: fixture.versionId, channel: "instagram" as const, accountId: fixture.accountId, siteId: fixture.siteId, manualOverride: true };
    const first = await createPublicationRecord({ ...input, scheduledFor: new Date(Date.now() + 60 * 60_000) });
    const later = new Date(Date.now() + 3 * 60 * 60_000);
    const second = await createPublicationRecord({ ...input, scheduledFor: later });
    assert.equal(second.id, first.id, "the open record is moved, not duplicated");
    assert.equal(second.scheduledFor?.toISOString(), later.toISOString());
    assert.equal(await prisma.publication.count({ where: { tenantId: fixture.tenantId } }), 1);

    // A failed record is rescheduled in place too.
    await prisma.publication.update({ where: { id: first.id }, data: { status: "failed", lastError: "boom" } });
    const third = await createPublicationRecord({ ...input, scheduledFor: new Date(Date.now() + 5 * 60 * 60_000) });
    assert.equal(third.id, first.id);
    assert.equal(third.status, "scheduled");
    assert.equal(third.lastError, null);

    // While a worker holds it, a new schedule is refused instead of racing the delivery.
    await prisma.publication.update({ where: { id: first.id }, data: { status: "publishing" } });
    await assert.rejects(() => createPublicationRecord({ ...input, scheduledFor: new Date(Date.now() + 7 * 60 * 60_000) }), /publication_in_flight/);
  } finally {
    await cleanupFixture(fixture.tenantId);
  }
});

test("stalled queued/publishing rows fail visibly without an automatic retry", async () => {
  const fixture = await createSchedulerFixture();
  try {
    const old = new Date(Date.now() - 3 * 60 * 60_000);
    const stalled = await createPublication(fixture, { status: "publishing" });
    const fresh = await createPublication(fixture, { status: "queued" });
    await prisma.$executeRaw`UPDATE publications SET updated_at = ${old} WHERE id = ${stalled.id}::uuid`;

    assert.ok((await recoverStalledPublications()) >= 1);
    const row = await prisma.publication.findUniqueOrThrow({ where: { id: stalled.id } });
    assert.equal(row.status, "failed");
    assert.equal(row.failureReason, "stalled");
    assert.equal(row.nextRetryAt, null, "remote outcome unknown: no automatic retry");
    assert.equal((await prisma.publication.findUniqueOrThrow({ where: { id: fresh.id } })).status, "queued");
  } finally {
    await cleanupFixture(fixture.tenantId);
  }
});

test("publish-now readiness evaluates the explicit human release, not the autopilot gate", async () => {
  const fixture = await createSchedulerFixture();
  try {
    const publication = await createPublication(fixture, { manualOverride: false });
    const automatic = await getPublicationReleaseReadiness(publication.id);
    assert.ok(automatic.blockers.includes("automation_policy_missing"));
    const manual = await getPublicationReleaseReadiness(publication.id, { manual: true });
    assert.ok(!manual.blockers.includes("automation_policy_missing"));
    assert.deepEqual(manual.blockers, [], "connected account with credentials is releasable by a human");
  } finally {
    await cleanupFixture(fixture.tenantId);
  }
});
