import { getPrismaClient } from "../prisma";
import { isUniqueViolation } from "../errors";
import { RepositoryError } from "../../../domain/interfaces/errors";
import type { ContentTextRepository } from "../../../domain/interfaces/repositories";

export const contentTextRepository: ContentTextRepository = {
  async create(tenantId, input) {
    const prisma = getPrismaClient();
    try {
      return (await prisma.contentText.create({
        data: {
          tenantId,
          topicId: input.topicId,
          type: input.type,
          language: input.language,
          status: input.status,
          promptVersion: input.promptVersion ?? null,
          dedupeHash: input.dedupeHash ?? null,
        },
      })) as never;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RepositoryError("conflict", "content text already exists");
      }
      throw error;
    }
  },

  async findById(tenantId, contentTextId) {
    const prisma = getPrismaClient();
    return (await prisma.contentText.findFirst({
      where: { id: contentTextId, tenantId },
    })) as never;
  },

  async findByDedupeHash(tenantId, dedupeHash) {
    const prisma = getPrismaClient();
    return (await prisma.contentText.findFirst({
      where: { tenantId, dedupeHash },
    })) as never;
  },

  async listByTopic(tenantId, topicId) {
    const prisma = getPrismaClient();
    return (await prisma.contentText.findMany({
      where: { tenantId, topicId },
      orderBy: { createdAt: "desc" },
    })) as never;
  },
};
