import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../prisma";
import { isUniqueViolation } from "../errors";
import { RepositoryError } from "../../../domain/interfaces/errors";
import type { FactRepository } from "../../../domain/interfaces/repositories";

export const factRepository: FactRepository = {
  async create(tenantId, topicId, input) {
    const prisma = getPrismaClient();
    try {
      return (await prisma.fact.create({
        data: {
          tenantId,
          topicId,
          sourceType: input.sourceType,
          sourceRef: input.sourceRef ?? null,
          content: input.content,
          contentHash: input.contentHash,
          metadata: input.metadata
            ? (input.metadata as Prisma.InputJsonObject)
            : Prisma.JsonNull,
        },
      })) as never;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RepositoryError("conflict", "fact already exists");
      }
      throw error;
    }
  },

  async findByHash(tenantId, topicId, contentHash) {
    const prisma = getPrismaClient();
    return (await prisma.fact.findFirst({
      where: { tenantId, topicId, contentHash },
    })) as never;
  },
};
