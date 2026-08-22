import { runSocialWorker } from "../src/infrastructure/workers/worker-social";

runSocialWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
