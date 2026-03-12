"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contentTextRepository = void 0;
const prisma_1 = require("../prisma");
const errors_1 = require("../errors");
const errors_2 = require("../../../domain/interfaces/errors");
exports.contentTextRepository = {
    async create(tenantId, input) {
        const prisma = (0, prisma_1.getPrismaClient)();
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
            }));
        }
        catch (error) {
            if ((0, errors_1.isUniqueViolation)(error)) {
                throw new errors_2.RepositoryError("conflict", "content text already exists");
            }
            throw error;
        }
    },
    async findById(tenantId, contentTextId) {
        const prisma = (0, prisma_1.getPrismaClient)();
        return (await prisma.contentText.findFirst({
            where: { id: contentTextId, tenantId },
        }));
    },
    async findByDedupeHash(tenantId, dedupeHash) {
        const prisma = (0, prisma_1.getPrismaClient)();
        return (await prisma.contentText.findFirst({
            where: { tenantId, dedupeHash },
        }));
    },
    async listByTopic(tenantId, topicId) {
        const prisma = (0, prisma_1.getPrismaClient)();
        return (await prisma.contentText.findMany({
            where: { tenantId, topicId },
            orderBy: { createdAt: "desc" },
        }));
    },
};
