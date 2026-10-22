/**
 * Global test guards.
 *
 * No test may talk to a live service. The local AI path is HTTP-based, so a
 * forgotten mock would otherwise "pass" only on a machine with Ollama running
 * and fail everywhere else — including CI. Failing loudly on any unmocked
 * `fetch` makes that impossible to miss.
 *
 * Tests that exercise HTTP must assign their own `global.fetch` mock; restore
 * happens automatically via `restoreMocks`.
 */
const unmockedFetch: typeof fetch = (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input);
  throw new Error(
    `Unmocked network call to ${url}. Mock global.fetch in this test — no test may reach a live service.`
  );
};

beforeEach(() => {
  global.fetch = unmockedFetch as typeof fetch;
});
