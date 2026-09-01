// Per-domain concurrency + politeness limits and per-source rate limiting.
// A broken or noisy publisher must never destabilize other publishers.

export type DomainThrottleOptions = {
  /** Max concurrent in-flight fetches per hostname. */
  maxConcurrentPerDomain?: number;
  /** Minimum time between two requests to the same hostname. */
  minIntervalMs?: number;
};

const DEFAULT_OPTIONS: Required<DomainThrottleOptions> = {
  maxConcurrentPerDomain: 2,
  minIntervalMs: 1000,
};

type DomainEntry = { inFlight: number; lastRequestAt: number };

export class DomainThrottle {
  private readonly options: Required<DomainThrottleOptions>;
  private readonly domains = new Map<string, DomainEntry>();

  constructor(options: DomainThrottleOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  private entry(hostname: string): DomainEntry {
    let entry = this.domains.get(hostname);
    if (!entry) {
      entry = { inFlight: 0, lastRequestAt: 0 };
      this.domains.set(hostname, entry);
    }
    return entry;
  }

  /** Serialize work per hostname: concurrency cap + polite delay.
   *  If the deadline elapses while waiting for a slot, throws so callers can
   *  surface a throttle timeout instead of hanging. */
  async run<T>(hostname: string, fn: () => Promise<T>, deadlineMs = 30_000): Promise<T> {
    const entry = this.entry(hostname);
    const started = Date.now();
    for (;;) {
      const elapsed = Date.now() - entry.lastRequestAt;
      const intervalOk = entry.lastRequestAt === 0 || elapsed >= this.options.minIntervalMs;
      if (entry.inFlight < this.options.maxConcurrentPerDomain && intervalOk) {
        break;
      }
      if (Date.now() - started > deadlineMs) {
        throw new Error(`domain_throttle_timeout host=${hostname}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    entry.inFlight += 1;
    entry.lastRequestAt = Date.now();
    try {
      return await fn();
    } finally {
      entry.inFlight -= 1;
      if (entry.inFlight <= 0 && this.domains.size > 256) {
        this.domains.delete(hostname);
      }
    }
  }

  /** Whether a hostname is at its concurrency cap (for metrics/tests). */
  isSaturated(hostname: string): boolean {
    const entry = this.domains.get(hostname);
    return entry ? entry.inFlight >= this.options.maxConcurrentPerDomain : false;
  }

  reset(): void {
    this.domains.clear();
  }
}

export type SourceRateLimitPolicy = {
  /** Max requests allowed per window. */
  maxRequests?: number;
  /** Window size in milliseconds (default 60_000). */
  windowMs?: number;
  /** Alternative/extra: fixed delay between requests in ms. */
  minIntervalMs?: number;
};

const DEFAULT_POLICY: Required<SourceRateLimitPolicy> = {
  maxRequests: 60,
  windowMs: 60_000,
  minIntervalMs: 0,
};

type SourceEntry = { timestamps: number[] };

export class SourceRateLimiter {
  private readonly sources = new Map<string, SourceEntry>();

  constructor(private readonly defaultPolicy: SourceRateLimitPolicy = {}) {}

  resolvePolicy(policy: SourceRateLimitPolicy | null | undefined): Required<SourceRateLimitPolicy> {
    return { ...DEFAULT_POLICY, ...this.defaultPolicy, ...(policy ?? {}) };
  }

  private entry(key: string): SourceEntry {
    let entry = this.sources.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.sources.set(key, entry);
    }
    return entry;
  }

  /** Wait (bounded by deadlineMs) until a slot is available. Returns false if
   *  the deadline passed first — callers record a rate-limit event then. */
  async waitForSlot(key: string, policy: SourceRateLimitPolicy | null | undefined, deadlineMs = 30_000): Promise<boolean> {
    const resolved = this.resolvePolicy(policy);
    const entry = this.entry(key);
    const started = Date.now();

    for (;;) {
      const now = Date.now();
      const cutoff = now - resolved.windowMs;
      entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

      const last = entry.timestamps[entry.timestamps.length - 1] ?? 0;
      const minInterval = resolved.minIntervalMs > 0 ? resolved.minIntervalMs : 0;
      const intervalOk = now - last >= minInterval;
      const capacityOk = entry.timestamps.length < resolved.maxRequests;

      if (capacityOk && intervalOk) {
        entry.timestamps.push(now);
        this.prune();
        return true;
      }

      const nextCandidate = Math.max(
        capacityOk ? 0 : cutoff + resolved.windowMs,
        intervalOk ? 0 : last + minInterval,
      );
      const waitMs = Math.max(25, Math.min(500, nextCandidate - now));
      if (now + waitMs > started + deadlineMs) {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  /** Events tracked for health metrics (rate-limit events). */
  private prune(): void {
    if (this.sources.size > 512) {
      for (const [key, entry] of this.sources) {
        if (entry.timestamps.length === 0) {
          this.sources.delete(key);
        }
      }
    }
  }

  reset(): void {
    this.sources.clear();
  }
}
