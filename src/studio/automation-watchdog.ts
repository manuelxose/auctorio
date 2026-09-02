// Automation watchdog (Phase 6). Detects projects/publications/workers that
// remain unexpectedly in the same active state beyond reasonable thresholds
// and produces actionable operator alerts. Runs as part of the automation
// worker tick. It never mutates publishing state beyond releasing stale
// repair locks.

import { getPrismaClient } from "../infrastructure/db/prisma";
import { getNumberEnv } from "../shared/utils/env";
import { structuredEvent } from "../shared/utils/logger";
import { notifyOperators } from "./notifications";
import { listWorkerHeartbeats } from "./worker-health";

const prisma = getPrismaClient();

function minutes(value: string, fallback: number): number {
  return Math.max(1, getNumberEnv(value, fallback));
}

export type WatchdogTickResult = {
  alerts: number;
  staleGenerations: number;
  staleImages: number;
  staleRepairs: number;
  overdueScheduled: number;
  unconsumedQueued: number;
  stuckPublishing: number;
  staleWorkers: number;
  locksReleased: number;
};

export async function runAutomationWatchdogTick(): Promise<WatchdogTickResult> {
  const now = Date.now();
  const generationMs = minutes("WATCHDOG_GENERATION_STALE_MIN", 45) * 60_000;
  const imageMs = minutes("WATCHDOG_IMAGE_STALE_MIN", 30) * 60_000;
  const repairMs = minutes("WATCHDOG_REPAIR_STALE_MIN", 30) * 60_000;
  const scheduledOverdueMs = minutes("WATCHDOG_SCHEDULED_OVERDUE_MIN", 20) * 60_000;
  const queuedMs = minutes("WATCHDOG_QUEUED_STALE_MIN", 15) * 60_000;
  const publishingMs = minutes("WATCHDOG_PUBLISHING_STALE_MIN", 15) * 60_000;

  const result: WatchdogTickResult = {
    alerts: 0,
    staleGenerations: 0,
    staleImages: 0,
    staleRepairs: 0,
    overdueScheduled: 0,
    unconsumedQueued: 0,
    stuckPublishing: 0,
    staleWorkers: 0,
    locksReleased: 0,
  };

  // 1. Stale generation / image / repair states on automatic projects.
  const staleProjects = await prisma.contentProject.findMany({
    where: {
      origin: "auto",
      deletedAt: null,
      automationSubstate: { in: ["generating", "waiting_for_image", "qa_repairing"] },
      updatedAt: { lt: new Date(now - generationMs) },
    },
    select: { id: true, tenantId: true, siteId: true, status: true, automationSubstate: true, updatedAt: true },
    take: 100,
  });

  for (const project of staleProjects) {
    const thresholdMs =
      project.automationSubstate === "waiting_for_image"
        ? imageMs
        : project.automationSubstate === "qa_repairing"
          ? repairMs
          : generationMs;
    if (now - project.updatedAt.getTime() < thresholdMs) {
      continue;
    }

    const label =
      project.automationSubstate === "waiting_for_image"
        ? "la imagen lleva demasiado tiempo pendiente"
        : project.automationSubstate === "qa_repairing"
          ? "la reparación de QA lleva demasiado tiempo en curso"
          : "la generación lleva demasiado tiempo en curso";

    if (project.automationSubstate === "generating") result.staleGenerations += 1;
    if (project.automationSubstate === "waiting_for_image") result.staleImages += 1;
    if (project.automationSubstate === "qa_repairing") result.staleRepairs += 1;
    result.alerts += 1;

    await notifyOperators([project.tenantId], {
      category: "operations",
      severity: "warning",
      title: `Autopilot: ${label}`,
      message: `El proyecto ${project.id} permanece en estado "${project.automationSubstate}" desde ${project.updatedAt.toISOString()}.`,
      entityType: "content_project",
      entityId: project.id,
      actionUrl: `/studio/content/${project.id}`,
      dedupeKey: `watchdog.project.${project.id}.${project.automationSubstate}`,
      dedupeWindowMs: 60 * 60_000,
    });
  }

  // 2. Overdue scheduled publications (scheduler not consuming).
  const overdue = await prisma.publication.findMany({
    where: {
      status: "scheduled",
      scheduledFor: { lt: new Date(now - scheduledOverdueMs) },
    },
    select: { id: true, tenantId: true, channel: true, scheduledFor: true },
    take: 50,
  });
  for (const publication of overdue) {
    result.overdueScheduled += 1;
    result.alerts += 1;
    await notifyOperators([publication.tenantId], {
      category: "operations",
      severity: "warning",
      title: "Publicación programada vencida sin ejecutar",
      message: `La publicación ${publication.id} (${publication.channel}) debía ejecutarse a las ${publication.scheduledFor?.toISOString() ?? "n/d"} y sigue programada.`,
      entityType: "publication",
      entityId: publication.id,
      actionUrl: "/studio/operations",
      dedupeKey: `watchdog.overdue.${publication.id}`,
      dedupeWindowMs: 60 * 60_000,
    });
  }

  // 3. Queued publications never consumed by the publishing worker.
  const unconsumed = await prisma.publication.findMany({
    where: {
      status: "queued",
      updatedAt: { lt: new Date(now - queuedMs) },
    },
    select: { id: true, tenantId: true, channel: true },
    take: 50,
  });
  for (const publication of unconsumed) {
    result.unconsumedQueued += 1;
    result.alerts += 1;
    await notifyOperators([publication.tenantId], {
      category: "operations",
      severity: "warning",
      title: "Publicación encolada sin consumir",
      message: `La publicación ${publication.id} (${publication.channel}) lleva encolada más de ${Math.round(queuedMs / 60_000)} minutos sin ser consumida por el worker.`,
      entityType: "publication",
      entityId: publication.id,
      actionUrl: "/studio/operations",
      dedupeKey: `watchdog.unconsumed.${publication.id}`,
      dedupeWindowMs: 60 * 60_000,
    });
  }

  // 4. Publishing stuck in-flight.
  const stuckPublishing = await prisma.publication.findMany({
    where: {
      status: "publishing",
      updatedAt: { lt: new Date(now - publishingMs) },
    },
    select: { id: true, tenantId: true, channel: true },
    take: 50,
  });
  for (const publication of stuckPublishing) {
    result.stuckPublishing += 1;
    result.alerts += 1;
    await notifyOperators([publication.tenantId], {
      category: "operations",
      severity: "warning",
      title: "Publicación atascada en ejecución",
      message: `La publicación ${publication.id} (${publication.channel}) lleva en estado "publishing" más de ${Math.round(publishingMs / 60_000)} minutos.`,
      entityType: "publication",
      entityId: publication.id,
      actionUrl: "/studio/operations",
      dedupeKey: `watchdog.stuck.${publication.id}`,
      dedupeWindowMs: 60 * 60_000,
    });
  }

  // 5. Worker heartbeat staleness (required workers only).
  const heartbeat = await listWorkerHeartbeats();
  const heartbeatMs = Math.max(15_000, getNumberEnv("WORKER_HEARTBEAT_INTERVAL_MS", 15_000));
  const staleAfterMs = Math.max(60_000, heartbeatMs * 4);
  const requiredWorkers = ["api", "automation", "scheduler", "publishing", "text", "image", "social", "discovery"];
  const staleWorkers = heartbeat.filter(
    (worker) =>
      requiredWorkers.includes(worker.name) &&
      worker.status !== "stopped" &&
      now - new Date(worker.lastBeatAt).getTime() > staleAfterMs,
  );
  if (staleWorkers.length > 0) {
    result.staleWorkers = staleWorkers.length;
    result.alerts += 1;
    const tenants = await prisma.automationPolicy.findMany({
      where: { enabled: true },
      select: { tenantId: true },
      distinct: ["tenantId"],
      take: 20,
    });
    await notifyOperators(tenants.map((row) => row.tenantId), {
      category: "operations",
      severity: "error",
      title: "Workers de producción sin heartbeat",
      message: `Los siguientes workers llevan sin heartbeat más de ${Math.round(staleAfterMs / 1000)}s: ${staleWorkers.map((worker) => worker.name).join(", ")}.`,
      entityType: "worker",
      entityId: "heartbeat",
      actionUrl: "/studio/operations",
      dedupeKey: `watchdog.workers.${staleWorkers.map((worker) => worker.name).join(".")}`,
      dedupeWindowMs: 30 * 60_000,
    });
  }

  // 6. Release repair locks held beyond the safety window so a wedged tick
  // cannot block self-healing forever.
  const locksReleased = await prisma.contentVersion.updateMany({
    where: {
      repairLockedUntil: { lt: new Date(now - 5 * 60_000) },
    },
    data: { repairLockedUntil: null },
  });
  result.locksReleased = locksReleased.count;

  if (result.alerts > 0) {
    structuredEvent("automation.watchdog", { ...result }, "warn");
  }
  return result;
}
