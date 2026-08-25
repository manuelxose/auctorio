import { runConnectionWorker } from "../src/infrastructure/workers/worker-connection";

runConnectionWorker().catch((error) => {
  console.error(error);
  process.exit(1);
});
