import { getPrismaClient } from "../prisma";
import { isUniqueViolation } from "../errors";
import { RepositoryError } from "../../../domain/interfaces/errors";
import type { ContentImageRepository } from "../../../domain/interfaces/repositories";

export const contentImageRepository: ContentImageRepository = {
  async create(tenantId, input) {
    const prisma = getPrismaClient();
    try {
      return (await prisma.contentImage.create({
        data: {
          tenantId,
          topicId: input.topicId,
          textId: input.textId ?? null,
          status: input.status,
          dedupeHash: input.dedupeHash ?? null,
        },
      })) as never;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RepositoryError("conflict", "content image already exists");
      }
      throw error;
    }
  },

  async findById(tenantId, contentImageId) {
    const prisma = getPrismaClient();
    return (await prisma.contentImage.findFirst({
      where: { id: contentImageId, tenantId },
    })) as never;
  },

  async findByDedupeHash(tenantId, dedupeHash) {
    const prisma = getPrismaClient();
    return (await prisma.contentImage.findFirst({
      where: { tenantId, dedupeHash },
    })) as never;
  },

  async listByTopic(tenantId, topicId) {
    const prisma = getPrismaClient();
    return (await prisma.contentImage.findMany({
      where: { tenantId, topicId },
      orderBy: { createdAt: "desc" },
    })) as never;
  },
};
