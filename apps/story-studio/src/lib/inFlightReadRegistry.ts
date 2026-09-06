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
 * Coalesces only currently-running idempotent reads. Settled values are never
 * cached, so a later owner invalidation always starts a fresh read.
 */
export class InFlightReadRegistry {
  readonly #reads = new Map<string, Promise<unknown>>();
  readonly #timeoutMs: number;

  constructor(timeoutMs: number) {
    this.#timeoutMs = timeoutMs;
  }

  read<T>(key: string, start: (signal: AbortSignal) => Promise<T>): { promise: Promise<T>; reused: boolean } {
    const existing = this.#reads.get(key) as Promise<T> | undefined;
    if (existing) return { promise: existing, reused: true };

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new InFlightReadTimeoutError(key, this.#timeoutMs));
        controller.abort();
      }, this.#timeoutMs);
    });
    const promise = Promise.race([start(controller.signal), timeout]).finally(() => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (this.#reads.get(key) === promise) this.#reads.delete(key);
    });
    this.#reads.set(key, promise);
    return { promise, reused: false };
  }

  has(key: string): boolean {
    return this.#reads.has(key);
  }
}
