import type { CostPolicy } from "../../domain/interfaces/ports";
import { checkCostPolicy } from "../../application/policies/cost-policy";
import { getPrismaClient } from "../db/prisma";

export const costPolicyAdapter: CostPolicy = {
  async check(tenantId, estimatedCostUsd) {
    const prisma = getPrismaClient();
    return checkCostPolicy(prisma, { tenantId, estimatedCostUsd });
  },
};
