import { getEnv, getNumberEnv } from "../../shared/utils/env";
import { runAutomationTick } from "../../studio/planner";
import { runIntervalWorker } from "./worker-runtime";
import { structuredEvent } from "../../shared/utils/logger";

export async function runAutomationWorker() {
  const redisUrl = getEnv("REDIS_URL", "");
  if (!redisUrl) {
    console.warn("[worker:automation] REDIS_URL is missing; worker not started");
    return;
  }

  await runIntervalWorker({
    name: "automation",
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
  });
}
