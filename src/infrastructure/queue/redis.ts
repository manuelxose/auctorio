import { getEnv, getNumberEnv } from "../../shared/utils/env";

export type RedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  connectTimeout?: number;
  maxRetriesPerRequest?: null;
  enableOfflineQueue?: boolean;
};

export function getRedisConnectionOptions(): RedisConnectionOptions {
  const redisUrl = getEnv("REDIS_URL", "");
  if (!redisUrl) {
    throw new Error("REDIS_URL is required");
  }

  const url = new URL(redisUrl);
  const db = url.pathname ? Number(url.pathname.replace("/", "")) : undefined;

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number.isNaN(db) ? undefined : db,
    // Avoid invisible multi-minute waits in CLI preflight/operations calls.
    connectTimeout: Math.max(1_000, getNumberEnv("REDIS_CONNECT_TIMEOUT_MS", 5_000)),
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  };
}

export function assertRedisConfigured(): void {
  if (!getEnv("REDIS_URL", "").trim()) {
    throw new Error("REDIS_URL is required; worker cannot start");
  }
}
