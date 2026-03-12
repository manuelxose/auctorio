"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCaseDependencies = void 0;
const repositories_1 = require("../infrastructure/db/repositories");
const job_queue_1 = require("../infrastructure/queue/job-queue");
const cost_policy_adapter_1 = require("../infrastructure/policies/cost-policy-adapter");
exports.useCaseDependencies = {
    topicRepository: repositories_1.topicRepository,
    factRepository: repositories_1.factRepository,
    contentTextRepository: repositories_1.contentTextRepository,
    contentImageRepository: repositories_1.contentImageRepository,
    jobRepository: repositories_1.jobRepository,
    queue: job_queue_1.jobQueue,
    costPolicy: cost_policy_adapter_1.costPolicyAdapter,
};
