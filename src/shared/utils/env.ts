export function getEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    if (fallback !== undefined) {
      return fallback;
    }
    return "";
  }
  return value;
}

export function getNumberEnv(key: string, fallback: number): number {
  const value = getEnv(key, "");
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

export function getBooleanEnv(key: string, fallback: boolean): boolean {
  const value = getEnv(key, "");
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function getJsonEnv<T>(key: string, fallback: T): T {
  const value = getEnv(key, "");
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`Invalid JSON env var: ${key} (${String(error)})`);
  }
}

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

export function getPublicBaseUrl(): string {
  const value = getEnv("PUBLIC_BASE_URL", "").trim();
  if (value) {
    return value.replace(/\/$/, "");
  }

  const host = getEnv("HOST", "0.0.0.0");
  const port = getEnv("PORT", "3000");
  return `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`;
}
