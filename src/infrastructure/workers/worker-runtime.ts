// Phase 5 — shared worker runtime.
//
// Every worker (interval-loop or BullMQ) runs through this module so that
// shutdown, heartbeat and process semantics are uniform:
//   - SIGTERM / SIGINT handling
//   - in-flight work drains before exit (interval workers)
//   - BullMQ workers close gracefully (stop taking jobs, finish or release
//     the active one, then exit)
//   - forced exit after WORKER_SHUTDOWN_TIMEOUT_MS to satisfy systemd
//   - liveness heartbeat into worker_heartbeats

import type { Worker } from "bullmq";
import { getNumberEnv } from "../../shared/utils/env";
import { structuredEvent } from "../../shared/utils/logger";
import {
  markWorkerRunning,
  markWorkerStopped,
  recordWorkerHeartbeat,
} from "../../studio/worker-health";

function shutdownTimeoutMs(): number {
  return Math.max(2_000, getNumberEnv("WORKER_SHUTDOWN_TIMEOUT_MS", 30_000));
}

function heartbeatIntervalMs(): number {
  return Math.max(2_000, getNumberEnv("WORKER_HEARTBEAT_INTERVAL_MS", 15_000));
}

/**
 * Uniform BullMQ worker options: configurable bounded concurrency, stalled-job
 * detection and lock duration from env.
 */
export function bullWorkerOptions(name: string, defaultConcurrency = 1) {
  const concurrency = Math.max(1, getNumberEnv(`WORKER_${name.toUpperCase()}_CONCURRENCY`, defaultConcurrency));
  return {
    concurrency,
    lockDuration: Math.max(30_000, getNumberEnv("WORKER_LOCK_DURATION_MS", 2 * 60_000)),
    stalledInterval: Math.max(10_000, getNumberEnv("WORKER_STALLED_INTERVAL_MS", 30_000)),
    maxStalledCount: Math.max(0, getNumberEnv("WORKER_MAX_STALLED_COUNT", 1)),
  };
}

function exitAfterDrain(code: number): void {
  // Allow the process to exit naturally once all handles are closed; force
  // after the timeout so a wedged provider cannot keep systemd waiting.
  setTimeout(() => {
    structuredEvent("worker.shutdown.forced", { code }, "warn");
    process.exit(code);
  }, shutdownTimeoutMs()).unref();
}

/** In-flight task tracker for interval workers. */
export type InFlightTracker = {
  running: boolean;
};

/**
 * Run a setInterval-driven worker with single-flight ticks and graceful
 * shutdown. One failing tick must never crash the loop: tick() is always
 * invoked inside try/catch by the caller contract, but we guard anyway.
 */
export async function runIntervalWorker(options: {
  name: string;
  intervalMs: number;
  tick: (ctx: { tickId: string }) => Promise<unknown>;
  /** Optional extra intervals (e.g. slow web-discovery tick). */
  extraIntervals?: Array<{ name: string; intervalMs: number; tick: () => Promise<unknown> }>;
}): Promise<void> {
  const { name, intervalMs, tick, extraIntervals = [] } = options;

  await markWorkerRunning(name);
  structuredEvent("worker.started", { worker: name, intervalMs, pid: process.pid });

  let shuttingDown = false;
  const trackers = new Map<string, InFlightTracker>();
  const extraTrackers: Array<{ tracker: InFlightTracker; timer: NodeJS.Timeout }> = [];

  const runOnce = async (label: string, fn: () => Promise<unknown>, tracker: InFlightTracker) => {
    if (tracker.running || shuttingDown) {
      return;
    }
    tracker.running = true;
    try {
      await fn();
    } catch (error) {
      structuredEvent(
        "worker.tick_failed",
        { worker: name, label, error: error instanceof Error ? error.message : String(error) },
        "error",
      );
    } finally {
      tracker.running = false;
    }
  };

  const timer = setInterval(() => {
    void runOnce("tick", () => tick({ tickId: `${name}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}` }), trackers.get("tick")!);
  }, intervalMs);
  trackers.set("tick", { running: false });

  for (const extra of extraIntervals) {
    const tracker: InFlightTracker = { running: false };
    const extraTimer = setInterval(() => {
      void runOnce(extra.name, extra.tick, tracker);
    }, extra.intervalMs);
    extraTrackers.push({ tracker, timer: extraTimer });
  }

  const heartbeat = setInterval(() => {
    const allTrackers = [...trackers.values(), ...extraTrackers.map((t) => t.tracker)];
    const busy = allTrackers.some((t) => t.running);
    void recordWorkerHeartbeat(name, busy ? "busy" : "idle").catch(() => undefined);
  }, heartbeatIntervalMs());

  const stop = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    structuredEvent("worker.shutdown.started", { worker: name });
    clearInterval(timer);
    for (const extra of extraTrackers) {
      clearInterval(extra.timer);
    }
    clearInterval(heartbeat);

    // Drain in-flight work: wait for running ticks to finish.
    const startedAt = Date.now();
    const deadline = startedAt + shutdownTimeoutMs();
    const busy = () =>
      [...trackers.values(), ...extraTrackers.map((t) => t.tracker)].some((t) => t.running);
    while (busy() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await markWorkerStopped(name).catch(() => undefined);
    structuredEvent("worker.shutdown.completed", { worker: name, drainedMs: Date.now() - startedAt, inFlightAbandoned: busy() });
    exitAfterDrain(busy() ? 1 : 0);
  };

  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());

  // Kick the first tick immediately.
  void runOnce("tick", () => tick({ tickId: `${name}-initial` }), trackers.get("tick")!);
}

/**
 * Wire graceful shutdown + heartbeat into a BullMQ worker.
 * worker.close() stops consuming new jobs and waits for the active job to
 * finish (or release it back after lock expiry), which satisfies
 * "in-flight job completion or safe release".
 */
export function registerBullWorkerShutdown(worker: Worker, name: string): void {
  void markWorkerRunning(name).catch(() => undefined);

  const heartbeat = setInterval(() => {
    void recordWorkerHeartbeat(name, "active").catch(() => undefined);
  }, heartbeatIntervalMs());

  let closing = false;
  const shutdown = async () => {
    if (closing) {
      return;
    }
    closing = true;
    structuredEvent("worker.shutdown.started", { worker: name });
    clearInterval(heartbeat);
    try {
      await worker.close();
      structuredEvent("worker.shutdown.completed", { worker: name });
      await markWorkerStopped(name).catch(() => undefined);
      process.exit(0);
    } catch (error) {
      structuredEvent("worker.shutdown.failed", { worker: name, error: error instanceof Error ? error.message : String(error) }, "error");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => {
    exitAfterDrain(0);
    void shutdown();
  });
  process.on("SIGINT", () => {
    exitAfterDrain(0);
    void shutdown();
  });
}
