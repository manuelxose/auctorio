"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_image_1 = require("../src/infrastructure/workers/worker-image");
(0, worker_image_1.runImageWorker)().catch((err) => {
    console.error(err);
    process.exit(1);
});
