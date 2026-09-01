// Phase 5 — lightweight in-process metrics registry.
//
// Counters and gauges per API/worker process, exported through
// /v2/operations/metrics and emitted as structured log events on a fixed
// cadence (METRICS_LOG_INTERVAL_MS). This intentionally avoids introducing a
// heavy observability platform; systemd journald + the operations page are
// the consumption surfaces.

import { structuredEvent } from "../shared/utils/logger";
import { getNumberEnv } from "../shared/utils/env";

type Counters = Map<string, number>;
type Gauges = Map<string, number>;

const counters: Counters = new Map();
const gauges: Gauges = new Map();
const startedAt = Date.now();

export function incrementCounter(name: string, value = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + value);
}

export function setGauge(name: string, value: number): void {
  gauges.set(name, value);
}

export function observeLatencyMs(name: string, ms: number): void {
  incrementCounter(`${name}_count`, 1);
  incrementCounter(`${name}_total_ms`, ms);
}

export type MetricsSnapshot = {
  startedAt: string;
  uptimeMs: number;
  counters: Record<string, number>;
  gauges: Record<string, number>;
};

export function getMetricsSnapshot(): MetricsSnapshot {
  const countersOut: Record<string, number> = {};
  for (const [key, value] of counters) {
    countersOut[key] = value;
  }
  const gaugesOut: Record<string, number> = {};
  for (const [key, value] of gauges) {
    gaugesOut[key] = value;
  }
  return {
    startedAt: new Date(startedAt).toISOString(),
    uptimeMs: Date.now() - startedAt,
    counters: countersOut,
    gauges: gaugesOut,
  };
}

export function resetMetrics(): void {
  counters.clear();
  gauges.clear();
}

let logTimerStarted = false;

/** Emit the snapshot as a structured log line on a fixed cadence. */
export function startMetricsLogging(): void {
  if (logTimerStarted) {
    return;
  }
  logTimerStarted = true;
  const intervalMs = Math.max(10_000, getNumberEnv("METRICS_LOG_INTERVAL_MS", 60_000));
  setInterval(() => {
    const snapshot = getMetricsSnapshot();
    if (Object.keys(snapshot.counters).length === 0 && Object.keys(snapshot.gauges).length === 0) {
      return;
    }
    structuredEvent("metrics.snapshot", snapshot);
  }, intervalMs);
}
