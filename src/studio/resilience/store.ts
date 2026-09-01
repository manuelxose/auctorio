// Shared counter store used by rate limiters and circuit breakers.
//
// Phase 1: single in-process store (the discovery worker is a single process).
// The interface is the seam for a Redis-backed implementation (SET NX / INCR
// with EXPIRE) if discovery is ever scaled beyond one worker — see Phase 2.

export interface ResilienceStore {
  incr(key: string, ttlMs?: number): Promise<number>;
  get(key: string): Promise<number | null>;
  set(key: string, value: number, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

type Entry = { value: number; expiresAt: number | null };

export class InMemoryResilienceStore implements ResilienceStore {
  private readonly entries = new Map<string, Entry>();

  private prune(key: string): void {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
    }
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    this.prune(key);
    const entry = this.entries.get(key);
    if (!entry) {
      this.entries.set(key, {
        value: 1,
        expiresAt: ttlMs ? Date.now() + ttlMs : null,
      });
      return 1;
    }
    entry.value += 1;
    if (ttlMs) {
      entry.expiresAt = Date.now() + ttlMs;
    }
    return entry.value;
  }

  async get(key: string): Promise<number | null> {
    this.prune(key);
    return this.entries.get(key)?.value ?? null;
  }

  async set(key: string, value: number, ttlMs?: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: ttlMs ? Date.now() + ttlMs : null });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

const sharedStore = new InMemoryResilienceStore();

export function getResilienceStore(): ResilienceStore {
  return sharedStore;
}
