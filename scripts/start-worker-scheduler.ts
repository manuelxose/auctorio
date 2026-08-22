import { runSchedulerWorker } from "../src/infrastructure/workers/worker-scheduler";

runSchedulerWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
