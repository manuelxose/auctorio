import { runControlWorker } from "../src/infrastructure/workers/worker-automation";

runControlWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
