"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUniqueViolation = isUniqueViolation;
const client_1 = require("@prisma/client");
function isUniqueViolation(error) {
    return error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
