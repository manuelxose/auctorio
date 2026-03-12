"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotImplemented = sendNotImplemented;
exports.sendJobAccepted = sendJobAccepted;
exports.sendContentAccepted = sendContentAccepted;
exports.sendTopicCreated = sendTopicCreated;
exports.sendUseCaseError = sendUseCaseError;
exports.getIdempotencyKey = getIdempotencyKey;
const ids_1 = require("../../shared/utils/ids");
function sendNotImplemented(reply, message) {
    return reply.code(501).send({ error: "not_implemented", message });
}
function sendJobAccepted(reply, jobId, status = "queued") {
    return reply.code(202).send({
        job_id: jobId,
        status,
    });
}
function sendContentAccepted(reply, jobId, contentId, status = "queued") {
    return reply.code(202).send({
        job_id: jobId,
        content_id: contentId,
        status,
    });
}
function sendTopicCreated(reply, topic) {
    return reply.code(201).send({
        id: topic.id,
        title: topic.title,
        description: topic.description ?? null,
        status: "active",
        created_at: topic.createdAt ? topic.createdAt.toISOString() : (0, ids_1.nowIso)(),
    });
}
function sendUseCaseError(reply, error) {
    const status = mapErrorCodeToStatus(error.code);
    const payload = {
        error: error.code,
        message: error.message,
    };
    if (error.details) {
        payload.details = error.details;
    }
    return reply.code(status).send(payload);
}
function getIdempotencyKey(request) {
    const header = request.headers["idempotency-key"];
    if (!header) {
        return undefined;
    }
    if (Array.isArray(header)) {
        return header[0];
    }
    return header;
}
function mapErrorCodeToStatus(code) {
    switch (code) {
        case "bad_request":
            return 400;
        case "unauthorized":
            return 401;
        case "forbidden":
            return 403;
        case "not_found":
            return 404;
        case "conflict":
            return 409;
        case "budget_exceeded":
            return 402;
        default:
            return 500;
    }
}
