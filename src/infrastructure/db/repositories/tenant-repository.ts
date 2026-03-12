import { getPrismaClient } from "../prisma";
import type { TenantRepository } from "../../../domain/interfaces/repositories";

export const tenantRepository: TenantRepository = {
  async findByApiKeyHash(apiKeyHash) {
    const prisma = getPrismaClient();
    return prisma.tenant.findUnique({
      where: { apiKeyHash },
    });
  },
};
