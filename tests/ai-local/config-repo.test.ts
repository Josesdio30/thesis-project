import { queryAux } from '@/lib/aux-db';
import { getCachedLocalAiConfigRow, resolveLocalAiConfig } from '@/lib/ai-local/config';
import {
  getLocalAiConfigRow,
  updateLocalAiConfig,
  refreshLocalAiConfig,
  resetLocalAiConfigCacheForTests,
  LOCAL_AI_CONFIG_TTL_MS,
  LOCAL_AI_CONFIG_REFRESH_TIMEOUT_MS,
} from '@/lib/ai-local/config-repo';

jest.mock('@/lib/aux-db', () => ({ queryAux: jest.fn() }));
const mockQuery = queryAux as jest.MockedFunction<typeof queryAux>;

const sql = (call = 0) => (mockQuery.mock.calls[call][0] as string).replace(/\s+/g, ' ').trim();
const params = (call = 0) => mockQuery.mock.calls[call][1];

const ROW = {
  base_url: 'http://gpu:11434',
  chat_model: 'qwen2.5:7b',
  embed_model: 'bge-m3',
  embed_dims: 1024,
  num_ctx: 4096,
  num_predict: 1024,
  keep_alive: '10m',
  retrieval_top_k: 5,
  updated_at: new Date('2026-10-01T00:00:00Z'),
};

beforeEach(() => {
  mockQuery.mockReset();
  resetLocalAiConfigCacheForTests();
  delete process.env.OLLAMA_CHAT_MODEL;
});
afterEach(() => {
  jest.useRealTimers();
  resetLocalAiConfigCacheForTests();
});

describe('getLocalAiConfigRow', () => {
  it('selects the singleton row', async () => {
    mockQuery.mockResolvedValue([ROW] as never);
    expect(await getLocalAiConfigRow()).toEqual(ROW);
    expect(sql()).toBe(
      'SELECT base_url, chat_model, embed_model, embed_dims, num_ctx, num_predict, keep_alive, ' +
        'retrieval_top_k, updated_at FROM local_ai_config WHERE id = 1'
    );
  });

  it('returns null when the row is missing', async () => {
    mockQuery.mockResolvedValue([] as never);
    expect(await getLocalAiConfigRow()).toBeNull();
  });
});

describe('updateLocalAiConfig', () => {
  it('updates only the provided columns, parameterised, and caches the result', async () => {
    mockQuery.mockResolvedValue([{ ...ROW, chat_model: 'llama3.1:8b', num_ctx: 2048 }] as never);

    const row = await updateLocalAiConfig({ chat_model: 'llama3.1:8b', num_ctx: 2048, keep_alive: undefined });

    expect(sql()).toBe(
      'UPDATE local_ai_config SET chat_model = $1, num_ctx = $2, updated_at = NOW() WHERE id = 1 ' +
        'RETURNING base_url, chat_model, embed_model, embed_dims, num_ctx, num_predict, keep_alive, ' +
        'retrieval_top_k, updated_at'
    );
    expect(params()).toEqual(['llama3.1:8b', 2048]);
    expect(row.chat_model).toBe('llama3.1:8b');
    expect(getCachedLocalAiConfigRow()).toEqual(row);
    expect(resolveLocalAiConfig().chatModel).toBe('llama3.1:8b');
  });

  it('never interpolates keys outside the whitelist', async () => {
    mockQuery.mockResolvedValue([ROW] as never);
    const hostile = { chat_model: 'x', 'id = 2; DROP TABLE users; --': 'y' } as unknown as Parameters<
      typeof updateLocalAiConfig
    >[0];

    await updateLocalAiConfig(hostile);

    expect(sql()).not.toContain('DROP');
    expect(params()).toEqual(['x']);
  });

  it('rejects an empty patch without touching the DB', async () => {
    await expect(updateLocalAiConfig({})).rejects.toThrow(/no local AI config fields to update/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('throws when the singleton row is missing', async () => {
    mockQuery.mockResolvedValue([] as never);
    await expect(updateLocalAiConfig({ num_ctx: 1 })).rejects.toThrow(/local_ai_config row is missing/);
    expect(getCachedLocalAiConfigRow()).toBeNull();
  });

  it('counts as a fresh load, so the next refresh does not re-query', async () => {
    mockQuery.mockResolvedValue([ROW] as never);
    await updateLocalAiConfig({ num_ctx: 4096 });
    await refreshLocalAiConfig();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('is not overwritten by a refresh that was already in flight', async () => {
    let releaseRead: (rows: unknown[]) => void = () => {};
    mockQuery.mockImplementationOnce(() => new Promise(resolve => (releaseRead = resolve as never)) as never);
    mockQuery.mockResolvedValueOnce([{ ...ROW, chat_model: 'new' }] as never);

    const pending = refreshLocalAiConfig();
    await updateLocalAiConfig({ chat_model: 'new' });
    releaseRead([{ ...ROW, chat_model: 'old' }]);
    const returned = await pending;

    expect(getCachedLocalAiConfigRow()?.chat_model).toBe('new');
    expect(returned?.chat_model).toBe('new');
  });
});

describe('refreshLocalAiConfig', () => {
  it('loads the row into the cache that resolveLocalAiConfig reads', async () => {
    mockQuery.mockResolvedValue([ROW] as never);
    expect(await refreshLocalAiConfig()).toEqual(ROW);
    expect(resolveLocalAiConfig().chatModel).toBe('qwen2.5:7b');
  });

  it('serves from the cache within the TTL and reloads after it', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    mockQuery.mockResolvedValue([ROW] as never);

    await refreshLocalAiConfig();
    jest.setSystemTime(1_000_000 + LOCAL_AI_CONFIG_TTL_MS - 1);
    await refreshLocalAiConfig();
    expect(mockQuery).toHaveBeenCalledTimes(1);

    jest.setSystemTime(1_000_000 + LOCAL_AI_CONFIG_TTL_MS);
    await refreshLocalAiConfig();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('reloads within the TTL when forced', async () => {
    mockQuery.mockResolvedValue([ROW] as never);
    await refreshLocalAiConfig();
    await refreshLocalAiConfig({ force: true });
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight query between concurrent callers', async () => {
    mockQuery.mockResolvedValue([ROW] as never);
    const [a, b, c] = await Promise.all([
      refreshLocalAiConfig(),
      refreshLocalAiConfig(),
      refreshLocalAiConfig({ force: true }),
    ]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(a).toEqual(ROW);
    expect(b).toEqual(ROW);
    expect(c).toEqual(ROW);
  });

  it('caches a missing row as null (defaults)', async () => {
    mockQuery.mockResolvedValue([] as never);
    expect(await refreshLocalAiConfig()).toBeNull();
    expect(resolveLocalAiConfig().chatModel).toBe('qwen2.5:14b-instruct-q4_K_M');
  });

  it('keeps the previous row and logs when the DB read fails', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockResolvedValueOnce([ROW] as never);
    await refreshLocalAiConfig();

    mockQuery.mockRejectedValueOnce(new Error('connection refused'));
    expect(await refreshLocalAiConfig({ force: true })).toEqual(ROW);

    expect(getCachedLocalAiConfigRow()).toEqual(ROW);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('local_ai_config'), expect.any(Error));
  });

  it('falls back to defaults when the very first read fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockRejectedValue(new Error('Missing AUX_POSTGRES_URL environment variable'));
    expect(await refreshLocalAiConfig()).toBeNull();
    expect(resolveLocalAiConfig().chatModel).toBe('qwen2.5:14b-instruct-q4_K_M');
  });

  it('backs off for the TTL after a failure instead of retrying on every call', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockRejectedValue(new Error('down'));
    await refreshLocalAiConfig();
    await refreshLocalAiConfig();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('gives up on a hung query after the timeout and keeps the previous row', async () => {
    jest.useFakeTimers();
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockImplementation(() => new Promise(() => {}) as never);

    const pending = refreshLocalAiConfig();
    await jest.advanceTimersByTimeAsync(LOCAL_AI_CONFIG_REFRESH_TIMEOUT_MS);

    expect(await pending).toBeNull();
    expect(error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: expect.stringMatching(/timed out/) })
    );
  });
});
