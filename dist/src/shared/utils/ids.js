"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.newId = newId;
exports.nowIso = nowIso;
const crypto_1 = require("crypto");
function newId() {
    return (0, crypto_1.randomUUID)();
}
function nowIso() {
    return new Date().toISOString();
}
