"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_publishing_1 = require("../src/infrastructure/workers/worker-publishing");
(0, worker_publishing_1.runPublishingWorker)().catch((err) => {
    console.error(err);
    process.exit(1);
});
