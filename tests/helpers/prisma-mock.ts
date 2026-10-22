/**
 * An auto-mocking stand-in for the Prisma client. Any `prisma.<model>.<method>`
 * is a lazily created `jest.fn()` (returning undefined until a test sets it),
 * so a route can be called without hand-listing every query it makes.
 * `$transaction` runs an interactive callback against the same mock, or
 * resolves an array of promises.
 *
 * Use inside a jest.mock factory (factories may not close over imports):
 *
 *   jest.mock('@/lib/prisma', () => {
 *     const { createPrismaMock } = jest.requireActual('../helpers/prisma-mock');
 *     const prisma = createPrismaMock();
 *     return { __esModule: true, prisma, default: prisma };
 *   });
 */
export type PrismaMock = Record<string, Record<string, jest.Mock>> & {
  $transaction: jest.Mock;
};

export function createPrismaMock(): PrismaMock {
  const models: Record<string, Record<string, jest.Mock>> = {};

  const modelProxy = () => {
    const methods: Record<string, jest.Mock> = {};
    return new Proxy(methods, {
      get(target, method: string | symbol) {
        if (typeof method !== 'string') return undefined;
        if (!(method in target)) target[method] = jest.fn();
        return target[method];
      },
    });
  };

  const root: PrismaMock = new Proxy(models as PrismaMock, {
    get(target, key: string | symbol) {
      if (typeof key !== 'string') return undefined;
      // Keep `then` undefined so the mock is never mistaken for a thenable.
      if (key === 'then') return undefined;
      if (key === '$transaction') {
        if (!target.$transaction) {
          target.$transaction = jest.fn(async (arg: unknown) =>
            typeof arg === 'function' ? (arg as (tx: PrismaMock) => unknown)(root) : Promise.all(arg as unknown[])
          );
        }
        return target.$transaction;
      }
      // Other client-level calls ($executeRaw, $queryRaw, …) are plain functions.
      if (key.startsWith('$')) {
        if (!(key in target)) (target as Record<string, unknown>)[key] = jest.fn(async () => 0);
        return (target as Record<string, unknown>)[key];
      }
      if (!(key in target)) target[key] = modelProxy();
      return target[key];
    },
  });

  return root;
}

/**
 * Clears every created mock's implementation and history. `clearMocks` resets
 * history only, so implementations set by `mockResolvedValue` would otherwise
 * leak between tests.
 */
export function resetPrismaMock(prisma: PrismaMock): void {
  for (const [key, model] of Object.entries(prisma)) {
    if (key === '$transaction') continue;
    if (typeof model === 'function') {
      (model as jest.Mock).mockReset().mockResolvedValue(0);
      continue;
    }
    for (const fn of Object.values(model)) fn.mockReset();
  }
}
