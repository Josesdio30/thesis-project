/**
 * Bounded concurrency for local model calls.
 *
 * Ollama serialises work per model anyway, so firing everything at once buys
 * nothing and risks eviction pressure when two models must stay resident. The
 * useful setting is a small, explicit ceiling: 1 for the LLM, 2 for embeddings.
 */

export class Semaphore {
  private available: number;
  private readonly waiting: (() => void)[] = [];

  constructor(permits: number) {
    if (!Number.isInteger(permits) || permits < 1) {
      throw new Error(`Semaphore needs at least 1 permit, got ${permits}`);
    }
    this.available = permits;
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }
    await new Promise<void>(resolve => this.waiting.push(resolve));
  }

  release(): void {
    const next = this.waiting.shift();
    // Hand the permit straight to the next waiter rather than returning it to
    // the pool — otherwise a burst of acquires can starve an early waiter.
    if (next) next();
    else this.available++;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

/**
 * Like `Promise.all(items.map(fn))` but with at most `concurrency` in flight.
 * Results keep input order regardless of completion order — callers pair them
 * positionally with the inputs.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const semaphore = new Semaphore(concurrency);
  return Promise.all(items.map((item, index) => semaphore.run(() => fn(item, index))));
}

/** Splits a list into fixed-size batches, preserving order. */
export function batch<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`batch size must be a positive integer, got ${size}`);
  }
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}
