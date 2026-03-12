import { runTextWorker } from "../src/infrastructure/workers/worker-text";

runTextWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
