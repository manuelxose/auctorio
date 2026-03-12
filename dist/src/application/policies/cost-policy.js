"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCostPolicy = checkCostPolicy;
const env_1 = require("../../shared/utils/env");
function startOfDayUtc(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
}
function startOfMonthUtc(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
}
function toNumber(value) {
    if (typeof value === "number") {
        return value;
    }
    if (value && typeof value === "object" && "toNumber" in value) {
        return value.toNumber();
    }
    if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
}
async function checkCostPolicy(prisma, input) {
    const dailyBudgetUsd = (0, env_1.getNumberEnv)("DAILY_BUDGET_USD", 0);
    const monthlyBudgetUsd = (0, env_1.getNumberEnv)("MONTHLY_BUDGET_USD", 0);
    if (dailyBudgetUsd <= 0 && monthlyBudgetUsd <= 0) {
        return { allowed: true, reason: "no_budget_configured" };
    }
    const now = new Date();
    const dayStart = startOfDayUtc(now);
    const monthStart = startOfMonthUtc(now);
    const [dailyText, dailyImage, monthlyText, monthlyImage] = await Promise.all([
        prisma.contentText.aggregate({
            where: { tenantId: input.tenantId, createdAt: { gte: dayStart } },
            _sum: { costUsd: true },
        }),
        prisma.contentImage.aggregate({
            where: { tenantId: input.tenantId, createdAt: { gte: dayStart } },
            _sum: { costUsd: true },
        }),
        prisma.contentText.aggregate({
            where: { tenantId: input.tenantId, createdAt: { gte: monthStart } },
            _sum: { costUsd: true },
        }),
        prisma.contentImage.aggregate({
            where: { tenantId: input.tenantId, createdAt: { gte: monthStart } },
            _sum: { costUsd: true },
        }),
    ]);
    const dailySpendUsd = toNumber(dailyText._sum.costUsd) + toNumber(dailyImage._sum.costUsd);
    const monthlySpendUsd = toNumber(monthlyText._sum.costUsd) + toNumber(monthlyImage._sum.costUsd);
    if (dailyBudgetUsd > 0 && dailySpendUsd + input.estimatedCostUsd > dailyBudgetUsd) {
        return {
            allowed: false,
            reason: "daily_budget_exceeded",
            dailyBudgetUsd,
            dailySpendUsd,
        };
    }
    if (monthlyBudgetUsd > 0 && monthlySpendUsd + input.estimatedCostUsd > monthlyBudgetUsd) {
        return {
            allowed: false,
            reason: "monthly_budget_exceeded",
            monthlyBudgetUsd,
            monthlySpendUsd,
        };
    }
    return {
        allowed: true,
        dailyBudgetUsd,
        monthlyBudgetUsd,
        dailySpendUsd,
        monthlySpendUsd,
    };
}
