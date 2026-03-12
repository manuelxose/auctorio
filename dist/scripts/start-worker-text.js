"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_text_1 = require("../src/infrastructure/workers/worker-text");
(0, worker_text_1.runTextWorker)().catch((err) => {
    console.error(err);
    process.exit(1);
});
