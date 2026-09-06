export class InFlightReadTimeoutError extends Error {
  readonly key: string;
  readonly timeoutMs: number;

  constructor(key: string, timeoutMs: number) {
    super(`Read timed out after ${timeoutMs}ms: ${key}`);
    this.name = "InFlightReadTimeoutError";
    this.key = key;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Coalesces idempotent reads and can retain a short current snapshot. A write
 * advances the generation without aborting existing readers, so their late
 * response can reach its original caller but never refill that snapshot.
 */
export class InFlightReadRegistry {
  readonly #reads = new Map<string, { promise: Promise<unknown>; controller: AbortController; settledAt: number | null; generation: number; releaseTimer?: ReturnType<typeof setTimeout> }>();
  readonly #timeoutMs: number;
  readonly #freshForMs: number;
  #generation = 0;

  constructor(timeoutMs: number, freshForMs = 0) {
    this.#timeoutMs = timeoutMs;
    this.#freshForMs = freshForMs;
  }

  read<T>(key: string, start: (signal: AbortSignal) => Promise<T>): { promise: Promise<T>; reused: boolean; fresh: boolean } {
    const existing = this.#reads.get(key) as { promise: Promise<T>; controller: AbortController; settledAt: number | null; generation: number; releaseTimer?: ReturnType<typeof setTimeout> } | undefined;
    if (existing && (existing.settledAt === null || Date.now() - existing.settledAt <= this.#freshForMs)) {
      return { promise: existing.promise, reused: true, fresh: existing.settledAt !== null };
    }
    if (existing) this.#release(key, existing);

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new InFlightReadTimeoutError(key, this.#timeoutMs));
        controller.abort();
      }, this.#timeoutMs);
    });
    const entry = { promise: Promise.resolve(undefined) as Promise<unknown>, controller, settledAt: null as number | null, generation: this.#generation, releaseTimer: undefined as ReturnType<typeof setTimeout> | undefined };
    const promise = Promise.race([start(controller.signal), timeout])
      .then((value) => {
        entry.settledAt = Date.now();
        if (entry.generation !== this.#generation || this.#freshForMs === 0) this.#release(key, entry);
        else entry.releaseTimer = setTimeout(() => this.#release(key, entry), this.#freshForMs);
        return value;
      }, (error) => {
        this.#release(key, entry);
        throw error;
      })
      .finally(() => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      });
    entry.promise = promise;
    this.#reads.set(key, entry);
    return { promise, reused: false, fresh: false };
  }

  has(key: string): boolean {
    return this.#reads.has(key);
  }

  invalidateAll(): void {
    for (const [key, entry] of this.#reads) {
      if (entry.settledAt === null) entry.controller.abort();
      this.#release(key, entry);
    }
  }

  invalidateSettled(): void {
    // In-flight reads continue for their original callers, but a write has
    // made their response ineligible for the bounded freshness cache.
    this.#generation += 1;
    for (const [key, entry] of this.#reads) {
      if (entry.settledAt !== null) this.#release(key, entry);
    }
  }

  #release(key: string, entry: { promise: Promise<unknown>; releaseTimer?: ReturnType<typeof setTimeout> }): void {
    if (entry.releaseTimer !== undefined) clearTimeout(entry.releaseTimer);
    if (this.#reads.get(key) === entry) this.#reads.delete(key);
  }
}
