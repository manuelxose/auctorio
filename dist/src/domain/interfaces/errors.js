"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepositoryError = void 0;
class RepositoryError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
exports.RepositoryError = RepositoryError;
