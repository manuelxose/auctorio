// Phase 5 — worker liveness heartbeats (worker_heartbeats table).
// One row per worker process name; updated every WORKER_HEARTBEAT_INTERVAL_MS.
// The operations health endpoint uses this to show worker health/uptime.

import { getPrismaClient } from "../infrastructure/db/prisma";
import { structuredEvent } from "../shared/utils/logger";

const prisma = getPrismaClient();

export type WorkerHeartbeatView = {
  name: string;
  pid: number;
  status: string;
  currentTask: string | null;
  startedAt: Date | null;
  lastBeatAt: Date;
  stoppedAt: Date | null;
  stale: boolean;
};

const STALE_AFTER_MS = 5 * 60_000;

export async function recordWorkerHeartbeat(name: string, currentTask?: string): Promise<void> {
  const now = new Date();
  const existing = await prisma.workerHeartbeat.findUnique({ where: { name } });
  if (existing) {
    await prisma.workerHeartbeat.update({
      where: { name },
      data: {
        pid: process.pid,
        status: "running",
        ...(currentTask ? { currentTask } : {}),
        lastBeatAt: now,
      },
    });
    return;
  }
  await prisma.workerHeartbeat.create({
    data: {
      name,
      pid: process.pid,
      status: "running",
      currentTask: currentTask ?? null,
      startedAt: now,
      lastBeatAt: now,
    },
  });
}

export async function markWorkerRunning(name: string): Promise<void> {
  const now = new Date();
  const existing = await prisma.workerHeartbeat.findUnique({ where: { name } });
  if (existing) {
    await prisma.workerHeartbeat.update({
      where: { name },
      data: { status: "running", pid: process.pid, startedAt: existing.startedAt ?? now, lastBeatAt: now },
    });
    return;
  }
  await prisma.workerHeartbeat.create({
    data: { name, pid: process.pid, status: "running", startedAt: now, lastBeatAt: now },
  });
}

export async function markWorkerStopped(name: string): Promise<void> {
  try {
    await prisma.workerHeartbeat.updateMany({
      where: { name },
      data: { status: "stopped", stoppedAt: new Date() },
    });
  } catch (error) {
    structuredEvent("worker.heartbeat.stopped_failed", { worker: name, error: String(error) }, "warn");
  }
}

export async function listWorkerHeartbeats(): Promise<WorkerHeartbeatView[]> {
  const rows = await prisma.workerHeartbeat.findMany({ orderBy: { name: "asc" } });
  const now = Date.now();
  return rows.map((row) => ({
    name: row.name,
    pid: row.pid,
    status: row.status,
    currentTask: row.currentTask,
    startedAt: row.startedAt,
    lastBeatAt: row.lastBeatAt,
    stoppedAt: row.stoppedAt,
    stale: row.status === "running" && now - row.lastBeatAt.getTime() > STALE_AFTER_MS,
  }));
}
