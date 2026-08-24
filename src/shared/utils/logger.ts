import { getEnv } from "./env";

// Structured operational logging. Events never contain secrets or tokens.

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): LogLevel {
  const configured = getEnv("LOG_LEVEL", "info").toLowerCase() as LogLevel;
  return LEVEL_ORDER[configured] !== undefined ? configured : "info";
}

function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (/(secret|token|password|credential|authorization|api_?key)/i.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function structuredEvent(
  event: string,
  data: Record<string, unknown> = {},
  level: LogLevel = "info",
): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[threshold()]) {
    return;
  }
  const record = sanitize({
    time: new Date().toISOString(),
    event,
    level,
    ...data,
  });
  const line = JSON.stringify(record);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
