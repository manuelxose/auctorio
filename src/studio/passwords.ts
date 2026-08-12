import crypto from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey as Buffer);
      },
    );
  });
}

export async function hashStudioPassword(password: string): Promise<string> {
  const normalized = password.trim();
  if (normalized.length < 10) {
    throw new Error("password_too_short");
  }

  const salt = crypto.randomBytes(16);
  const derivedKey = await scryptAsync(normalized, salt);
  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyStudioPassword(password: string, hash: string): Promise<boolean> {
  const parts = hash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, cost, blockSize, parallelization, salt, encodedKey] = parts;
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password.trim(),
      Buffer.from(salt, "base64url"),
      Buffer.from(encodedKey, "base64url").length,
      {
        N: Number.parseInt(cost, 10),
        r: Number.parseInt(blockSize, 10),
        p: Number.parseInt(parallelization, 10),
      },
      (error, candidateKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(candidateKey as Buffer);
      },
    );
  });

  const expected = Buffer.from(encodedKey, "base64url");
  if (derivedKey.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedKey, expected);
}
