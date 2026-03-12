import { runScrapingWorker } from "../src/infrastructure/workers/worker-scraping";

runScrapingWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
