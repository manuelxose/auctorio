"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContentTypeFromPath = getContentTypeFromPath;
const node_path_1 = __importDefault(require("node:path"));
const MIME_BY_EXTENSION = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".txt": "text/plain; charset=utf-8",
};
function getContentTypeFromPath(filePath) {
    const extension = node_path_1.default.extname(filePath).toLowerCase();
    return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}
