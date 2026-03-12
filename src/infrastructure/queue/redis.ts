import { getEnv } from "../../shared/utils/env";

export type RedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
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
  };
}
