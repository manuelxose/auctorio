import { runAutomationWorker } from "../src/infrastructure/workers/worker-automation";

runAutomationWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
