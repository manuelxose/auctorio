import { runImageWorker } from "../src/infrastructure/workers/worker-image";

runImageWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
