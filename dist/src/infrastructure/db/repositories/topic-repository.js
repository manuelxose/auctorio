"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.topicRepository = void 0;
const prisma_1 = require("../prisma");
const errors_1 = require("../errors");
const errors_2 = require("../../../domain/interfaces/errors");
exports.topicRepository = {
    async create(tenantId, input) {
        const prisma = (0, prisma_1.getPrismaClient)();
        try {
            return await prisma.topic.create({
                data: {
                    tenantId,
                    title: input.title,
                    description: input.description ?? null,
                },
            });
        }
        catch (error) {
            if ((0, errors_1.isUniqueViolation)(error)) {
                throw new errors_2.RepositoryError("conflict", "topic already exists");
            }
            throw error;
        }
    },
    async findById(tenantId, topicId) {
        const prisma = (0, prisma_1.getPrismaClient)();
        return prisma.topic.findFirst({
            where: { id: topicId, tenantId },
        });
    },
    async findByTitle(tenantId, title) {
        const prisma = (0, prisma_1.getPrismaClient)();
        return prisma.topic.findFirst({
            where: { tenantId, title },
        });
    },
};
