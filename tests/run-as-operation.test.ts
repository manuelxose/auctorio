import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { runAsOperation } from "../src/studio/source-registry-discovery";

const prisma = getPrismaClient();

async function fixture() {
  const seed = `runop-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" } });
  const site = await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: seed, type: "generic_rest", locale: "es-ES" } });
  return { tenantId: tenant.id, siteId: site.id };
}

test("runAsOperation reuses the active operation and replaces a stale one", async () => {
  process.env.SOURCE_OPERATION_TIMEOUT_MS = "150";
  const { tenantId, siteId } = await fixture();
  const input = { tenantId, siteId, type: "sources.discover", userId: null, entityType: "site" };
  let runs = 0;
  const work = () => { runs += 1; return new Promise<object>(() => undefined); };

  const first = await runAsOperation(input, work);
  const second = await runAsOperation(input, work);
  assert.equal(second.operationId, first.operationId);
  assert.equal(await prisma.operation.count({ where: { tenantId, siteId, type: input.type } }), 1);

  // A never-resolving handler is failed by the timeout, retryable.
  await new Promise((resolve) => setTimeout(resolve, 600));
  const timedOut = await prisma.operation.findUniqueOrThrow({ where: { id: first.operationId } });
  assert.equal(timedOut.status, "failed");
  assert.equal(runs, 1);

  // A queued operation untouched for >30 minutes is failed and a fresh one starts.
  const stale = await prisma.operation.create({ data: { tenantId, siteId, type: input.type, status: "running" } });
  await prisma.$executeRaw`UPDATE operations SET updated_at = now() - interval '2 hours' WHERE id = ${stale.id}::uuid`;
  const third = await runAsOperation(input, async () => ({}));
  assert.notEqual(third.operationId, stale.id);
  assert.equal((await prisma.operation.findUniqueOrThrow({ where: { id: stale.id } })).status, "failed");
});
