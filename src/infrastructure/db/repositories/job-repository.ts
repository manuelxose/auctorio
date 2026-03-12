import { getPrismaClient } from "../prisma";
import { isUniqueViolation } from "../errors";
import { RepositoryError } from "../../../domain/interfaces/errors";
import type { JobRepository } from "../../../domain/interfaces/repositories";

export const jobRepository: JobRepository = {
  async findByIdempotency(tenantId, idempotencyKey) {
    const prisma = getPrismaClient();
    return prisma.job.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey,
        },
      },
    });
  },

  async create(tenantId, input) {
    const prisma = getPrismaClient();
    try {
      return await prisma.job.create({
        data: {
          tenantId,
          type: input.type,
          status: input.status ?? "queued",
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RepositoryError("conflict", "job already exists");
      }
      throw error;
    }
  },
};
