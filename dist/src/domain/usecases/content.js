"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContentTextUseCase = getContentTextUseCase;
exports.getContentImageUseCase = getContentImageUseCase;
exports.generateImageFromTextUseCase = generateImageFromTextUseCase;
const types_1 = require("./types");
const errors_1 = require("../interfaces/errors");
const hash_1 = require("../../shared/utils/hash");
async function getContentTextUseCase(deps, input) {
    const content = await deps.contentTextRepository.findById(input.tenantId, input.contentTextId);
    if (!content) {
        return (0, types_1.err)("not_found", "content text not found");
    }
    return (0, types_1.ok)({ content });
}
async function getContentImageUseCase(deps, input) {
    const content = await deps.contentImageRepository.findById(input.tenantId, input.contentImageId);
    if (!content) {
        return (0, types_1.err)("not_found", "content image not found");
    }
    return (0, types_1.ok)({ content });
}
async function generateImageFromTextUseCase(deps, input) {
    const text = await deps.contentTextRepository.findById(input.tenantId, input.contentTextId);
    if (!text) {
        return (0, types_1.err)("not_found", "content text not found");
    }
    const estimatedCostUsd = input.estimatedCostUsd ?? 0;
    const policy = await deps.costPolicy.check(input.tenantId, estimatedCostUsd);
    if (!policy.allowed) {
        return (0, types_1.err)("budget_exceeded", policy.reason ?? "budget_exceeded", policy);
    }
    const promptVersion = promptVersionFromOptions(input.options);
    const dedupeHash = (0, hash_1.sha256)(`${input.tenantId}:${text.id}:${promptVersion}`);
    const existing = await deps.contentImageRepository.findByDedupeHash(input.tenantId, dedupeHash);
    if (existing) {
        return (0, types_1.ok)({ content: existing, job: null, deduped: true });
    }
    let content;
    try {
        content = await deps.contentImageRepository.create(input.tenantId, {
            topicId: text.topicId,
            textId: text.id,
            status: "queued",
            dedupeHash,
        });
    }
    catch (error) {
        if (error instanceof errors_1.RepositoryError && error.code === "conflict") {
            const duplicate = await deps.contentImageRepository.findByDedupeHash(input.tenantId, dedupeHash);
            if (duplicate) {
                return (0, types_1.ok)({ content: duplicate, job: null, deduped: true });
            }
        }
        throw error;
    }
    let job = null;
    try {
        job = await deps.jobRepository.create(input.tenantId, {
            type: "image",
            idempotencyKey: input.idempotencyKey ?? null,
        });
    }
    catch (error) {
        if (error instanceof errors_1.RepositoryError && error.code === "conflict") {
            return (0, types_1.err)("conflict", "idempotency_key_already_used");
        }
        throw error;
    }
    await deps.queue.enqueueImageJob(job.id, {
        jobId: job.id,
        tenantId: input.tenantId,
        topicId: text.topicId,
        contentImageId: content.id,
        mode: "contextual",
        textId: text.id,
        options: input.options ?? {},
    });
    return (0, types_1.ok)({ content, job, deduped: false });
}
function promptVersionFromOptions(options) {
    if (options && typeof options.prompt_version === "string" && options.prompt_version.trim()) {
        return options.prompt_version.trim();
    }
    return "v1";
}
