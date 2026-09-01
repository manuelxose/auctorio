// Circuit breaker for source fetches: closed → open → half_open.
// State is kept in-process; see store.ts for the Phase 2 Redis seam.

export type CircuitState = "closed" | "open" | "half_open";

export type CircuitBreakerOptions = {
  /** Consecutive failures before the breaker opens. */
  failureThreshold?: number;
  /** Time the breaker stays open before allowing one half-open probe. */
  cooldownMs?: number;
};

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  cooldownMs: 15 * 60_000,
};

type BreakerEntry = {
  failures: number;
  state: CircuitState;
  openedAt: number | null;
};

export class CircuitBreaker {
  private readonly options: Required<CircuitBreakerOptions>;
  private readonly entries = new Map<string, BreakerEntry>();

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  private entry(key: string): BreakerEntry {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { failures: 0, state: "closed", openedAt: null };
      this.entries.set(key, entry);
    }
    // Time-driven transition: open → half_open once the cooldown elapsed.
    if (entry.state === "open" && entry.openedAt !== null && Date.now() - entry.openedAt >= this.options.cooldownMs) {
      entry.state = "half_open";
      entry.openedAt = null;
    }
    return entry;
  }

  async state(key: string): Promise<CircuitState> {
    return this.entry(key).state;
  }

  /** Whether a fetch attempt is allowed right now. */
  async canAttempt(key: string): Promise<boolean> {
    const state = this.entry(key).state;
    return state === "closed" || state === "half_open";
  }

  async recordSuccess(key: string): Promise<void> {
    const entry = this.entry(key);
    entry.failures = 0;
    entry.state = "closed";
    entry.openedAt = null;
  }

  async recordFailure(key: string): Promise<void> {
    const entry = this.entry(key);
    entry.failures += 1;
    if (entry.state === "closed" && entry.failures >= this.options.failureThreshold) {
      entry.state = "open";
      entry.openedAt = Date.now();
    } else if (entry.state === "half_open") {
      // A half-open probe failed: re-open immediately.
      entry.state = "open";
      entry.openedAt = Date.now();
    }
  }

  /** Failures recorded in the current closed window. */
  async consecutiveFailures(key: string): Promise<number> {
    return this.entry(key).failures;
  }

  /** Test helper: wipe all state. */
  reset(): void {
    this.entries.clear();
  }
}

/** Resolved breaker options for a source from its configuration JSON. */
export function resolveBreakerOptions(configuration: unknown): CircuitBreakerOptions {
  const config =
    configuration && typeof configuration === "object"
      ? (configuration as Record<string, unknown>)
      : {};
  const breaker = config.circuitBreaker && typeof config.circuitBreaker === "object"
    ? (config.circuitBreaker as Record<string, unknown>)
    : {};
  return {
    failureThreshold: typeof breaker.failureThreshold === "number" ? breaker.failureThreshold : DEFAULT_OPTIONS.failureThreshold,
    cooldownMs: typeof breaker.cooldownMs === "number" ? breaker.cooldownMs : DEFAULT_OPTIONS.cooldownMs,
  };
}
