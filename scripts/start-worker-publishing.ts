import { runPublishingWorker } from "../src/infrastructure/workers/worker-publishing";

runPublishingWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
