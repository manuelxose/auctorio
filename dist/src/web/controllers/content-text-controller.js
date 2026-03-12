"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContentText = getContentText;
const usecases_1 = require("../../domain/usecases");
const dependencies_1 = require("../dependencies");
const common_1 = require("./common");
async function getContentText(request, reply) {
    const params = request.params;
    const result = await (0, usecases_1.getContentTextUseCase)(dependencies_1.useCaseDependencies, {
        tenantId: request.tenantId,
        contentTextId: params.id,
    });
    if (!result.ok) {
        return (0, common_1.sendUseCaseError)(reply, result.error);
    }
    const content = result.data.content;
    return reply.code(200).send({
        id: content.id,
        topic_id: content.topicId,
        type: content.type,
        language: content.language,
        status: content.status,
        output: content.output ?? null,
        created_at: content.createdAt.toISOString(),
    });
}
