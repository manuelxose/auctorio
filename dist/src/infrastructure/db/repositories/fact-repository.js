"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.factRepository = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../prisma");
const errors_1 = require("../errors");
const errors_2 = require("../../../domain/interfaces/errors");
exports.factRepository = {
    async create(tenantId, topicId, input) {
        const prisma = (0, prisma_1.getPrismaClient)();
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
                        ? input.metadata
                        : client_1.Prisma.JsonNull,
                },
            }));
        }
        catch (error) {
            if ((0, errors_1.isUniqueViolation)(error)) {
                throw new errors_2.RepositoryError("conflict", "fact already exists");
            }
            throw error;
        }
    },
    async findByHash(tenantId, topicId, contentHash) {
        const prisma = (0, prisma_1.getPrismaClient)();
        return (await prisma.fact.findFirst({
            where: { tenantId, topicId, contentHash },
        }));
    },
};
