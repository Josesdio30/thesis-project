import { Semaphore, mapWithConcurrency, batch } from '@/lib/ai-local/queue';

/** Lets every pending microtask and timer callback settle. Counting individual
 *  microtask ticks is brittle — the count depends on how many awaits the
 *  implementation happens to use. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const deferred = () => {
  let resolve!: (v: unknown) => void;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

describe('Semaphore', () => {
  it.each([0, -1, 1.5])('rejects %p permits', permits => {
    expect(() => new Semaphore(permits)).toThrow(/at least 1 permit/);
  });

  it('runs tasks up to the permit count and queues the rest', async () => {
    const semaphore = new Semaphore(2);
    const gates = [deferred(), deferred(), deferred()];
    let started = 0;

    const runs = gates.map(g => semaphore.run(async () => { started++; await g.promise; }));

    await flush();
    expect(started).toBe(2);

    gates[0].resolve(null);
    await flush();
    expect(started).toBe(3);

    gates[1].resolve(null);
    gates[2].resolve(null);
    await Promise.all(runs);
  });

  it('releases the permit when the task throws', async () => {
    const semaphore = new Semaphore(1);
    await expect(semaphore.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(semaphore.run(async () => 'next')).resolves.toBe('next');
  });

  // Returning the permit to the pool instead of handing it to the next waiter
  // lets a later burst of acquires starve an earlier one.
  it('hands a released permit to the longest waiter', async () => {
    const semaphore = new Semaphore(1);
    const order: number[] = [];
    const first = deferred();

    const a = semaphore.run(async () => { order.push(1); await first.promise; });
    const b = semaphore.run(async () => { order.push(2); });
    const c = semaphore.run(async () => { order.push(3); });

    first.resolve(null);
    await Promise.all([a, b, c]);
    expect(order).toEqual([1, 2, 3]);
  });
});

describe('mapWithConcurrency', () => {
  it('returns results in input order regardless of completion order', async () => {
    const delays = [30, 10, 20];
    const result = await mapWithConcurrency(delays, 3, async (ms, i) => {
      await new Promise(r => setTimeout(r, ms));
      return i;
    });
    expect(result).toEqual([0, 1, 2]);
  });

  it('never exceeds the concurrency ceiling', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBe(2);
  });

  it('short-circuits on an empty list', async () => {
    const fn = jest.fn();
    await expect(mapWithConcurrency([], 2, fn)).resolves.toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('propagates the first rejection', async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, async n => {
        if (n === 2) throw new Error('task failed');
        return n;
      })
    ).rejects.toThrow('task failed');
  });
});

describe('batch', () => {
  it('splits into fixed-size groups, keeping order', () => {
    expect(batch([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batch([], 3)).toEqual([]);
  });

  it.each([0, -2, 2.5])('rejects a batch size of %p', size => {
    expect(() => batch([1], size)).toThrow(/positive integer/);
  });
});
