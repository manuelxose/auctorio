import crypto from "node:crypto";
import { getEnv } from "./env";

// Server-side secret encryption for provider-managed OAuth tokens.
// Keys are NEVER returned to the browser and ciphertext is the only
// representation persisted in the database.

const ALGORITHM = "aes-256-gcm";

function encryptionKey(): Buffer {
  const raw = getEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "");
  if (!raw) {
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY is required to store social connection tokens");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(value: string): string {
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("invalid_ciphertext_format");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ciphertext = Buffer.from(parts[3], "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function tryDecryptSecret(value: string): string | null {
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generatePkceVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function hmacHex(value: string): string {
  const secret = getEnv("STUDIO_PROXY_SHARED_SECRET", "studio-proxy-dev-secret-change-me");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}
