"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTopicUseCase = createTopicUseCase;
exports.addFactUseCase = addFactUseCase;
exports.generateTextUseCase = generateTextUseCase;
exports.generateImageUseCase = generateImageUseCase;
exports.getResultsUseCase = getResultsUseCase;
const types_1 = require("./types");
const errors_1 = require("../interfaces/errors");
const text_1 = require("../../shared/utils/text");
const hash_1 = require("../../shared/utils/hash");
async function createTopicUseCase(deps, input) {
    const title = input.title?.trim();
    if (!title) {
        return (0, types_1.err)("bad_request", "title is required");
    }
    const existing = await deps.topicRepository.findByTitle(input.tenantId, title);
    if (existing) {
        return (0, types_1.err)("conflict", "topic already exists");
    }
    try {
        const topic = await deps.topicRepository.create(input.tenantId, {
            title,
            description: input.description ?? null,
        });
        return (0, types_1.ok)({ topic });
    }
    catch (error) {
        if (error instanceof errors_1.RepositoryError && error.code === "conflict") {
            return (0, types_1.err)("conflict", "topic already exists");
        }
        throw error;
    }
}
async function addFactUseCase(deps, input) {
    if (!input.sourceType) {
        return (0, types_1.err)("bad_request", "source_type is required");
    }
    const allowedSourceTypes = new Set(["manual", "rss", "html", "api"]);
    if (!allowedSourceTypes.has(input.sourceType)) {
        return (0, types_1.err)("bad_request", "invalid source_type");
    }
    const topic = await deps.topicRepository.findById(input.tenantId, input.topicId);
    if (!topic) {
        return (0, types_1.err)("not_found", "topic not found");
    }
    if (input.sourceType === "manual") {
        if (!input.content?.trim()) {
            return (0, types_1.err)("bad_request", "content is required for manual facts");
        }
        const contentHash = (0, hash_1.sha256)((0, text_1.normalizeText)(input.content));
        const existing = await deps.factRepository.findByHash(input.tenantId, input.topicId, contentHash);
        if (existing) {
            return (0, types_1.ok)({ kind: "manual", fact: existing, created: false });
        }
        try {
            const fact = await deps.factRepository.create(input.tenantId, input.topicId, {
                sourceType: "manual",
                sourceRef: input.sourceRef ?? null,
                content: input.content,
                contentHash,
                metadata: input.metadata ?? null,
            });
            return (0, types_1.ok)({ kind: "manual", fact, created: true });
        }
        catch (error) {
            if (error instanceof errors_1.RepositoryError && error.code === "conflict") {
                const duplicate = await deps.factRepository.findByHash(input.tenantId, input.topicId, contentHash);
                if (duplicate) {
                    return (0, types_1.ok)({ kind: "manual", fact: duplicate, created: false });
                }
            }
            throw error;
        }
    }
    if (!input.sourceRef) {
        return (0, types_1.err)("bad_request", "source_ref is required for scraping");
    }
    if (input.idempotencyKey) {
        const existingJob = await deps.jobRepository.findByIdempotency(input.tenantId, input.idempotencyKey);
        if (existingJob) {
            return (0, types_1.ok)({ kind: "scraping_job", job: existingJob });
        }
    }
    const job = await deps.jobRepository.create(input.tenantId, {
        type: "scraping",
        idempotencyKey: input.idempotencyKey ?? null,
    });
    await deps.queue.enqueueScrapingJob(job.id, {
        jobId: job.id,
        tenantId: input.tenantId,
        topicId: input.topicId,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        metadata: input.metadata ?? null,
    });
    return (0, types_1.ok)({ kind: "scraping_job", job });
}
async function generateTextUseCase(deps, input) {
    if (!input.type || !input.language) {
        return (0, types_1.err)("bad_request", "type and language are required");
    }
    const allowedTypes = new Set(["seo", "instagram"]);
    const allowedLanguages = new Set(["es", "en"]);
    if (!allowedTypes.has(input.type) || !allowedLanguages.has(input.language)) {
        return (0, types_1.err)("bad_request", "invalid type or language");
    }
    const topic = await deps.topicRepository.findById(input.tenantId, input.topicId);
    if (!topic) {
        return (0, types_1.err)("not_found", "topic not found");
    }
    const estimatedCostUsd = input.estimatedCostUsd ?? 0;
    const policy = await deps.costPolicy.check(input.tenantId, estimatedCostUsd);
    if (!policy.allowed) {
        return (0, types_1.err)("budget_exceeded", policy.reason ?? "budget_exceeded", policy);
    }
    const promptVersion = promptVersionFromOptions(input.options);
    const dedupeHash = (0, hash_1.sha256)(`${input.tenantId}:${input.topicId}:${input.type}:${input.language}:${promptVersion}`);
    const existing = await deps.contentTextRepository.findByDedupeHash(input.tenantId, dedupeHash);
    if (existing) {
        return (0, types_1.ok)({ content: existing, job: null, deduped: true });
    }
    let content;
    try {
        content = await deps.contentTextRepository.create(input.tenantId, {
            topicId: input.topicId,
            type: input.type,
            language: input.language,
            status: "queued",
            promptVersion,
            dedupeHash,
        });
    }
    catch (error) {
        if (error instanceof errors_1.RepositoryError && error.code === "conflict") {
            const duplicate = await deps.contentTextRepository.findByDedupeHash(input.tenantId, dedupeHash);
            if (duplicate) {
                return (0, types_1.ok)({ content: duplicate, job: null, deduped: true });
            }
        }
        throw error;
    }
    let job = null;
    try {
        job = await deps.jobRepository.create(input.tenantId, {
            type: "text",
            idempotencyKey: input.idempotencyKey ?? null,
        });
    }
    catch (error) {
        if (error instanceof errors_1.RepositoryError && error.code === "conflict") {
            return (0, types_1.err)("conflict", "idempotency_key_already_used");
        }
        throw error;
    }
    await deps.queue.enqueueTextJob(job.id, {
        jobId: job.id,
        tenantId: input.tenantId,
        topicId: input.topicId,
        contentTextId: content.id,
        type: input.type,
        language: input.language,
        options: input.options ?? {},
    });
    return (0, types_1.ok)({ content, job, deduped: false });
}
async function generateImageUseCase(deps, input) {
    const mode = input.mode ?? "independent";
    const allowedModes = new Set(["contextual", "independent"]);
    if (!allowedModes.has(mode)) {
        return (0, types_1.err)("bad_request", "invalid mode");
    }
    const topic = await deps.topicRepository.findById(input.tenantId, input.topicId);
    if (!topic) {
        return (0, types_1.err)("not_found", "topic not found");
    }
    const estimatedCostUsd = input.estimatedCostUsd ?? 0;
    const policy = await deps.costPolicy.check(input.tenantId, estimatedCostUsd);
    if (!policy.allowed) {
        return (0, types_1.err)("budget_exceeded", policy.reason ?? "budget_exceeded", policy);
    }
    const promptVersion = promptVersionFromOptions(input.options);
    const dedupeHash = (0, hash_1.sha256)(`${input.tenantId}:${input.topicId}:${mode}:${promptVersion}`);
    const existing = await deps.contentImageRepository.findByDedupeHash(input.tenantId, dedupeHash);
    if (existing) {
        return (0, types_1.ok)({ content: existing, job: null, deduped: true });
    }
    let content;
    try {
        content = await deps.contentImageRepository.create(input.tenantId, {
            topicId: input.topicId,
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
        topicId: input.topicId,
        contentImageId: content.id,
        mode,
        options: input.options ?? {},
    });
    return (0, types_1.ok)({ content, job, deduped: false });
}
async function getResultsUseCase(deps, input) {
    const topic = await deps.topicRepository.findById(input.tenantId, input.topicId);
    if (!topic) {
        return (0, types_1.err)("not_found", "topic not found");
    }
    const [texts, images] = await Promise.all([
        deps.contentTextRepository.listByTopic(input.tenantId, input.topicId),
        deps.contentImageRepository.listByTopic(input.tenantId, input.topicId),
    ]);
    return (0, types_1.ok)({ topic, texts, images });
}
function promptVersionFromOptions(options) {
    if (options && typeof options.prompt_version === "string" && options.prompt_version.trim()) {
        return options.prompt_version.trim();
    }
    return "v1";
}
