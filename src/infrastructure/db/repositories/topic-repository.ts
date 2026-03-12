import { getPrismaClient } from "../prisma";
import { isUniqueViolation } from "../errors";
import { RepositoryError } from "../../../domain/interfaces/errors";
import type { TopicRepository } from "../../../domain/interfaces/repositories";

export const topicRepository: TopicRepository = {
  async create(tenantId, input) {
    const prisma = getPrismaClient();
    try {
      return await prisma.topic.create({
        data: {
          tenantId,
          title: input.title,
          description: input.description ?? null,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RepositoryError("conflict", "topic already exists");
      }
      throw error;
    }
  },

  async findById(tenantId, topicId) {
    const prisma = getPrismaClient();
    return prisma.topic.findFirst({
      where: { id: topicId, tenantId },
    });
  },

  async findByTitle(tenantId, title) {
    const prisma = getPrismaClient();
    return prisma.topic.findFirst({
      where: { tenantId, title },
    });
  },
};
