"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobRepository = void 0;
const prisma_1 = require("../prisma");
const errors_1 = require("../errors");
const errors_2 = require("../../../domain/interfaces/errors");
exports.jobRepository = {
    async findByIdempotency(tenantId, idempotencyKey) {
        const prisma = (0, prisma_1.getPrismaClient)();
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
        const prisma = (0, prisma_1.getPrismaClient)();
        try {
            return await prisma.job.create({
                data: {
                    tenantId,
                    type: input.type,
                    status: input.status ?? "queued",
                    idempotencyKey: input.idempotencyKey ?? null,
                },
            });
        }
        catch (error) {
            if ((0, errors_1.isUniqueViolation)(error)) {
                throw new errors_2.RepositoryError("conflict", "job already exists");
            }
            throw error;
        }
    },
};
