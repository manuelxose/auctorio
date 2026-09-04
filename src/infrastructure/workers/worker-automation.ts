import { getNumberEnv } from "../../shared/utils/env";
import { runAutomationTick } from "../../studio/planner";
import { runAutomationWatchdogTick } from "../../studio/automation-watchdog";
import { runSchedulerTick } from "./worker-scheduler";
import { runIntervalWorker } from "./worker-runtime";
import { structuredEvent } from "../../shared/utils/logger";
import { assertRedisConfigured } from "../queue/redis";

/** One control-plane process owns planning, scheduling and watchdog checks. */
export async function runControlWorker() {
  assertRedisConfigured();

  await runIntervalWorker({
    name: "control",
    intervalMs: Math.max(30_000, getNumberEnv("AUTOMATION_INTERVAL_MS", 120_000)),
    tick: async () => {
      const result = await runAutomationTick();
      if (
        result.candidatesSelected > 0 ||
        result.projectsAdvanced > 0 ||
        result.socialJobsCreated > 0 ||
        result.publicationsCreated > 0
      ) {
        structuredEvent("automation.tick", { ...result });
      }
    },
    extraIntervals: [
      {
        name: "scheduler",
        intervalMs: Math.max(5_000, getNumberEnv("SCHEDULER_INTERVAL_MS", 10_000)),
        tick: async () => {
          const result = await runSchedulerTick();
          if (result.claimed > 0 || result.failed > 0) {
            structuredEvent("scheduler.tick", result);
          }
        },
      },
      {
        name: "automation-watchdog",
        intervalMs: Math.max(60_000, getNumberEnv("WATCHDOG_INTERVAL_MS", 120_000)),
        tick: async () => {
          await runAutomationWatchdogTick();
        },
      },
    ],
  });
}

/** @deprecated Use runControlWorker; kept for launcher compatibility. */
export const runAutomationWorker = runControlWorker;
