import { runDiscoveryWorker } from "../src/infrastructure/workers/worker-discovery";

runDiscoveryWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
