"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_scraping_1 = require("../src/infrastructure/workers/worker-scraping");
(0, worker_scraping_1.runScrapingWorker)().catch((err) => {
    console.error(err);
    process.exit(1);
});
