"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.costPolicyAdapter = void 0;
const cost_policy_1 = require("../../application/policies/cost-policy");
const prisma_1 = require("../db/prisma");
exports.costPolicyAdapter = {
    async check(tenantId, estimatedCostUsd) {
        const prisma = (0, prisma_1.getPrismaClient)();
        return (0, cost_policy_1.checkCostPolicy)(prisma, { tenantId, estimatedCostUsd });
    },
};
