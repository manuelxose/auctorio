// Phase 6 — retry classification, bounded backoff and the publish circuit breaker.
import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import {
  canTransition,
  classifyPublicationError,
  maxPublicationRetries,
  nextRetryDelay,
  transitionPublication,
} from "../src/studio/publication";
import {
  CIRCUIT_BREAKER_THRESHOLD,
  isWebsitePublishCircuitOpen,
  recordWebsitePublishFailure,
  resetWebsitePublishCircuit,
} from "../src/studio/automation";

const prisma = getPrismaClient();

test.after(async () => {
  await prisma.$disconnect();
});

test("retry classification separates transient from permanent failures", () => {
  const transient = [
    "ECONNRESET",
    "connect ETIMEDOUT",
    "fetch failed",
    "Too Many Requests",
    "429 rate limit exceeded",
    "HTTP 503 Service Unavailable",
    "timeout of 10000ms exceeded",
    "socket hang up",
    "Network error",
  ];
  for (const message of transient) {
    assert.equal(classifyPublicationError(message), "transient", message);
  }

  const permanent = [
    "401 Unauthorized",
    "403 Forbidden",
    "invalid api key",
    "credentials rejected",
    "validation failed",
    "slug already exists",
  ];
  for (const message of permanent) {
    assert.equal(classifyPublicationError(message), "permanent", message);
  }
});

test("backoff ladder is bounded: 1, 5, 15, 60 minutes", () => {
  assert.equal(nextRetryDelay(0), 60_000);
  assert.equal(nextRetryDelay(1), 300_000);
  assert.equal(nextRetryDelay(2), 900_000);
  assert.equal(nextRetryDelay(3), 3_600_000);
  assert.equal(nextRetryDelay(9), 3_600_000);
  assert.ok(maxPublicationRetries() >= 3);
});

test("publication state transitions", () => {
  assert.equal(canTransition("scheduled", "queued"), true);
  assert.equal(canTransition("queued", "publishing"), true);
  assert.equal(canTransition("publishing", "published"), true);
  assert.equal(transitionPublication("publishing", "published"), "published");
});

test("circuit breaker opens after consecutive failures and resets on success", async () => {
  const seed = `cb-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" },
  });
  try {
    const policy = await prisma.automationPolicy.create({
      data: { tenantId: tenant.id, enabled: true, mode: "autopilot" },
    });

    assert.equal(await isWebsitePublishCircuitOpen(tenant.id, null), false);

    for (let index = 0; index < CIRCUIT_BREAKER_THRESHOLD - 1; index += 1) {
      await recordWebsitePublishFailure(tenant.id, null);
    }
    assert.equal(await isWebsitePublishCircuitOpen(tenant.id, null), false);

    await recordWebsitePublishFailure(tenant.id, null);
    assert.equal(await isWebsitePublishCircuitOpen(tenant.id, null), true);

    const afterOpen = await prisma.automationPolicy.findUnique({ where: { id: policy.id } });
    assert.equal(afterOpen?.circuitOpen, true);
    assert.equal(afterOpen?.state, "degraded");
    assert.equal(afterOpen?.consecutivePublishFailures, CIRCUIT_BREAKER_THRESHOLD);

    await resetWebsitePublishCircuit(tenant.id, null);
    assert.equal(await isWebsitePublishCircuitOpen(tenant.id, null), false);
    const afterReset = await prisma.automationPolicy.findUnique({ where: { id: policy.id } });
    assert.equal(afterReset?.consecutivePublishFailures, 0);
    assert.equal(afterReset?.circuitOpen, false);
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
});
