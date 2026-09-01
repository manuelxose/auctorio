// Bounded retry with exponential backoff and full jitter.
// Pure helpers are exported for deterministic testing.

export type RetryOptions = {
  /** Total attempts including the first call. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Exponential factor between attempts. */
  factor?: number;
  /** Jitter applied as a random fraction of the computed delay. */
  jitterRatio?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
};

export const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, "signal" | "shouldRetry" | "onRetry">> = {
  attempts: 2,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  factor: 2,
  jitterRatio: 0.2,
};

/** Deterministic backoff (before jitter). */
export function computeBackoffDelayMs(attempt: number, options: RetryOptions = {}): number {
  const { baseDelayMs, maxDelayMs, factor } = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const raw = baseDelayMs * Math.pow(factor, attempt - 1);
  return Math.min(maxDelayMs, raw);
}

/** Delay with ±jitterRatio around the deterministic value. */
export function jitteredDelayMs(base: number, jitterRatio = DEFAULT_RETRY_OPTIONS.jitterRatio): number {
  const jitter = base * jitterRatio;
  return Math.max(0, Math.round(base - jitter + Math.random() * 2 * jitter));
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const abort = () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
    }
  });
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /aborted|abort/i.test(error.message))
  );
}

/** Transient errors worth retrying: timeouts, rate limits and 5xx responses. */
export function isTransientError(error: unknown): boolean {
  if (isAbortError(error)) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  if (/timeout|timed out/i.test(error.message)) {
    return true;
  }
  if (/status=429|rate.?limit/i.test(error.message)) {
    return true;
  }
  const statusMatch = /status=(\d{3})/.exec(error.message);
  if (statusMatch) {
    const status = Number.parseInt(statusMatch[1], 10);
    return status >= 500 && status <= 599;
  }
  if (/(ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|EPIPE|ETIMEDOUT|socket hang up|network)/i.test(error.message)) {
    return true;
  }
  return false;
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts, jitterRatio, signal, shouldRetry, onRetry } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable = shouldRetry ? shouldRetry(error) : isTransientError(error);
      if (!retryable || attempt >= attempts) {
        throw error;
      }
      const base = computeBackoffDelayMs(attempt, options);
      const delayMs = jitteredDelayMs(base, jitterRatio);
      onRetry?.(attempt + 1, error, delayMs);
      await sleep(delayMs, signal);
    }
  }
  throw lastError;
}
