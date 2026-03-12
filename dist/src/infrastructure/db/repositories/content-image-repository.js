"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contentImageRepository = void 0;
const prisma_1 = require("../prisma");
const errors_1 = require("../errors");
const errors_2 = require("../../../domain/interfaces/errors");
exports.contentImageRepository = {
    async create(tenantId, input) {
        const prisma = (0, prisma_1.getPrismaClient)();
        try {
            return (await prisma.contentImage.create({
                data: {
                    tenantId,
                    topicId: input.topicId,
                    textId: input.textId ?? null,
                    status: input.status,
                    dedupeHash: input.dedupeHash ?? null,
                },
            }));
        }
        catch (error) {
            if ((0, errors_1.isUniqueViolation)(error)) {
                throw new errors_2.RepositoryError("conflict", "content image already exists");
            }
            throw error;
        }
    },
    async findById(tenantId, contentImageId) {
        const prisma = (0, prisma_1.getPrismaClient)();
        return (await prisma.contentImage.findFirst({
            where: { id: contentImageId, tenantId },
        }));
    },
    async findByDedupeHash(tenantId, dedupeHash) {
        const prisma = (0, prisma_1.getPrismaClient)();
        return (await prisma.contentImage.findFirst({
            where: { tenantId, dedupeHash },
        }));
    },
    async listByTopic(tenantId, topicId) {
        const prisma = (0, prisma_1.getPrismaClient)();
        return (await prisma.contentImage.findMany({
            where: { tenantId, topicId },
            orderBy: { createdAt: "desc" },
        }));
    },
};
