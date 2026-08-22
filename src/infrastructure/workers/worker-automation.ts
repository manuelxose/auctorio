import { getEnv, getNumberEnv } from "../../shared/utils/env";
import { runAutomationTick } from "../../studio/planner";

export async function runAutomationWorker() {
  const redisUrl = getEnv("REDIS_URL", "");
  if (!redisUrl) {
    console.warn("[worker:automation] REDIS_URL is missing; worker not started");
    return;
  }

  const intervalMs = Math.max(30_000, getNumberEnv("AUTOMATION_INTERVAL_MS", 120_000));
  let running = false;
  let shuttingDown = false;

  const tick = async () => {
    if (running || shuttingDown) {
      return;
    }
    running = true;
    try {
      const result = await runAutomationTick();
      if (
        result.candidatesSelected > 0 ||
        result.projectsAdvanced > 0 ||
        result.socialJobsCreated > 0 ||
        result.publicationsCreated > 0
      ) {
        console.log("[worker:automation] tick", result);
      }
    } catch (error) {
      console.error("[worker:automation] tick failed", error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  const stop = () => {
    shuttingDown = true;
    clearInterval(timer);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  void tick();
  console.log("[worker:automation] started", { intervalMs });
}
