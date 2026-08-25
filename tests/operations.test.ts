import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import {
  classifyRetryable,
  completeOperation,
  createOperation,
  failOperation,
  findOrCreateOperationForJob,
  getOperation,
  listOperations,
  startOperation,
  touchOperationProgress,
} from "../src/studio/operations";

const prisma = getPrismaClient();

async function createTenant(): Promise<string> {
  const seed = `ops-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" },
  });
  return tenant.id;
}

test.after(async () => {
  await prisma.$disconnect();
});

test("error classification separates retryable from terminal failures", () => {
  assert.equal(classifyRetryable(new Error("fetch timeout after 30000ms")).retryable, true);
  assert.equal(classifyRetryable(new Error("ECONNREFUSED 127.0.0.1:443")).retryable, true);
  assert.equal(classifyRetryable(new Error("rate limit exceeded 429")).retryable, true);
  assert.equal(classifyRetryable(new Error("invalid api token")).retryable, false);
  assert.equal(classifyRetryable(new Error("validation_error")).retryable, false);
});

test("operation lifecycle computes progress and terminal states", async () => {
  const tenantId = await createTenant();
  const operation = await createOperation({
    tenantId,
    type: "text_generation",
    entityType: "content_project",
    entityId: crypto.randomUUID(),
    totalSteps: 4,
  });
  assert.equal(operation.status, "queued");
  assert.equal(operation.progress, 0);

  await startOperation(operation.id, "generating");
  const halfway = await touchOperationProgress(operation.id, { completedSteps: 2, phase: "generating" });
  assert.equal(halfway.progress, 50);

  const done = await completeOperation(operation.id);
  assert.equal(done.status, "succeeded");
  assert.equal(done.progress, 100);
  assert.ok(done.finishedAt);

  // A failed step must not be reported as success.
  const partial = await createOperation({ tenantId, type: "publish", totalSteps: 3 });
  await startOperation(partial.id);
  await failOperation(partial.id, { errorCode: "step_failed", errorSummary: "media upload failed", retryable: false });
  const loaded = await getOperation(tenantId, partial.id);
  assert.equal(loaded?.status, "failed");
  assert.equal(loaded?.errorCode, "step_failed");
  assert.equal(loaded?.errorSummary, "media upload failed");
});

test("operation correlation is idempotent per job key", async () => {
  const tenantId = await createTenant();
  const jobKey = `job-${Date.now()}`;
  const first = await findOrCreateOperationForJob({ tenantId, type: "connection_verification", jobKey, queueName: "queue_connection" });
  const second = await findOrCreateOperationForJob({ tenantId, type: "connection_verification", jobKey, queueName: "queue_connection" });
  assert.equal(first.id, second.id);
});

test("operations are tenant-scoped and support filtering with status counts", async () => {
  const tenantA = await createTenant();
  const tenantB = await createTenant();
  await createOperation({ tenantId: tenantA, type: "text_generation" });
  await createOperation({ tenantId: tenantB, type: "text_generation" });

  const listA = await listOperations(tenantA, {});
  assert.ok(listA.items.every((item) => item.tenantId === tenantA));
  assert.ok(listA.items.length >= 1);
  assert.equal(typeof listA.counts.queued, "number");

  const failed = await listOperations(tenantA, { status: "failed" });
  assert.ok(failed.items.every((item) => item.status === "failed"));
});
