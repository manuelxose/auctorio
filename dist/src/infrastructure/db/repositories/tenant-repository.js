"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantRepository = void 0;
const prisma_1 = require("../prisma");
exports.tenantRepository = {
    async findByApiKeyHash(apiKeyHash) {
        const prisma = (0, prisma_1.getPrismaClient)();
        return prisma.tenant.findUnique({
            where: { apiKeyHash },
        });
    },
};
