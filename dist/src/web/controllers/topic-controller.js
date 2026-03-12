"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTopic = createTopic;
exports.addFacts = addFacts;
exports.generateText = generateText;
exports.generateImage = generateImage;
exports.getResults = getResults;
const usecases_1 = require("../../domain/usecases");
const env_1 = require("../../shared/utils/env");
const dependencies_1 = require("../dependencies");
const common_1 = require("./common");
function mapContentText(content) {
    return {
        id: content.id,
        topic_id: content.topicId,
        type: content.type,
        language: content.language,
        status: content.status,
        output: content.output ?? null,
        created_at: content.createdAt.toISOString(),
    };
}
function mapContentImage(content) {
    return {
        id: content.id,
        topic_id: content.topicId,
        text_id: content.textId ?? null,
        status: content.status,
        storage_path: content.storagePath ?? null,
        created_at: content.createdAt.toISOString(),
    };
}
async function createTopic(request, reply) {
    const body = request.body;
    const result = await (0, usecases_1.createTopicUseCase)(dependencies_1.useCaseDependencies, {
        tenantId: request.tenantId,
        title: body?.title,
        description: body?.description ?? null,
    });
    if (!result.ok) {
        return (0, common_1.sendUseCaseError)(reply, result.error);
    }
    return (0, common_1.sendTopicCreated)(reply, result.data.topic);
}
async function addFacts(request, reply) {
    const params = request.params;
    const body = request.body;
    const result = await (0, usecases_1.addFactUseCase)(dependencies_1.useCaseDependencies, {
        tenantId: request.tenantId,
        topicId: params.id,
        sourceType: body?.source_type,
        sourceRef: body?.source_ref,
        content: body?.content,
        metadata: body?.metadata ?? null,
        idempotencyKey: (0, common_1.getIdempotencyKey)(request),
    });
    if (!result.ok) {
        return (0, common_1.sendUseCaseError)(reply, result.error);
    }
    if (result.data.kind === "manual") {
        const fact = result.data.fact;
        return reply.code(result.data.created ? 201 : 200).send({
            id: fact.id,
            topic_id: fact.topicId,
            source_type: fact.sourceType,
            source_ref: fact.sourceRef ?? null,
            content: fact.content,
            created_at: fact.createdAt.toISOString(),
        });
    }
    return (0, common_1.sendJobAccepted)(reply, result.data.job.id, result.data.job.status);
}
async function generateText(request, reply) {
    const params = request.params;
    const body = request.body;
    const result = await (0, usecases_1.generateTextUseCase)(dependencies_1.useCaseDependencies, {
        tenantId: request.tenantId,
        topicId: params.id,
        type: body?.type,
        language: body?.language,
        options: body?.options ?? null,
        idempotencyKey: (0, common_1.getIdempotencyKey)(request),
        estimatedCostUsd: (0, env_1.getNumberEnv)("ESTIMATED_TEXT_COST_USD", 0),
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
    return (0, common_1.sendContentAccepted)(reply, result.data.job.id, result.data.content.id, result.data.job.status);
}
async function generateImage(request, reply) {
    const params = request.params;
    const body = request.body;
    const result = await (0, usecases_1.generateImageUseCase)(dependencies_1.useCaseDependencies, {
        tenantId: request.tenantId,
        topicId: params.id,
        mode: body?.mode,
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
    return (0, common_1.sendContentAccepted)(reply, result.data.job.id, result.data.content.id, result.data.job.status);
}
async function getResults(request, reply) {
    const params = request.params;
    const result = await (0, usecases_1.getResultsUseCase)(dependencies_1.useCaseDependencies, {
        tenantId: request.tenantId,
        topicId: params.id,
    });
    if (!result.ok) {
        return (0, common_1.sendUseCaseError)(reply, result.error);
    }
    return reply.code(200).send({
        topic_id: result.data.topic.id,
        texts: result.data.texts.map(mapContentText),
        images: result.data.images.map(mapContentImage),
    });
}
