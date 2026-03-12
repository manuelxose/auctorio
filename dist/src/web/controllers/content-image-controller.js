"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImageFromText = generateImageFromText;
exports.getContentImage = getContentImage;
const usecases_1 = require("../../domain/usecases");
const env_1 = require("../../shared/utils/env");
const dependencies_1 = require("../dependencies");
const common_1 = require("./common");
async function generateImageFromText(request, reply) {
    const params = request.params;
    const body = request.body;
    const result = await (0, usecases_1.generateImageFromTextUseCase)(dependencies_1.useCaseDependencies, {
        tenantId: request.tenantId,
        contentTextId: params.id,
        options: body?.options ?? null,
        idempotencyKey: (0, common_1.getIdempotencyKey)(request),
        estimatedCostUsd: (0, env_1.getNumberEnv)("ESTIMATED_IMAGE_COST_USD", 0),
    });
    if (!result.ok) {
        return (0, common_1.sendUseCaseError)(reply, result.error);
    }
    if (result.data.deduped || !result.data.job) {
        return reply.code(200).send({
            job_id: null,
            content_id: result.data.content.id,
            status: result.data.content.status,
        });
    }
    return reply.code(202).send({
        job_id: result.data.job.id,
        content_id: result.data.content.id,
        status: result.data.job.status,
    });
}
async function getContentImage(request, reply) {
    const params = request.params;
    const result = await (0, usecases_1.getContentImageUseCase)(dependencies_1.useCaseDependencies, {
        tenantId: request.tenantId,
        contentImageId: params.id,
    });
    if (!result.ok) {
        return (0, common_1.sendUseCaseError)(reply, result.error);
    }
    const content = result.data.content;
    return reply.code(200).send({
        id: content.id,
        topic_id: content.topicId,
        text_id: content.textId ?? null,
        status: content.status,
        storage_path: content.storagePath ?? null,
        created_at: content.createdAt.toISOString(),
    });
}
