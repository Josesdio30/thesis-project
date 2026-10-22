import { localEmbed, localEmbeddingProvider } from '@/lib/ai-local/embeddings';
import * as client from '@/lib/ai-local/ollama-client';
import { refreshLocalAiConfig } from '@/lib/ai-local/config-repo';
import { setCachedLocalAiConfigRow, type LocalAiConfigRow } from '@/lib/ai-local/config';

jest.mock('@/lib/ai-local/ollama-client');
const mockedEmbed = client.ollamaEmbed as jest.MockedFunction<typeof client.ollamaEmbed>;
// The DB-backed config cache is exercised in config-repo.test.ts; here it only
// has to stay out of the database.
jest.mock('@/lib/ai-local/config-repo', () => ({ refreshLocalAiConfig: jest.fn() }));
const mockRefresh = refreshLocalAiConfig as jest.MockedFunction<typeof refreshLocalAiConfig>;
afterEach(() => setCachedLocalAiConfigRow(null));
const warmWith = (row: LocalAiConfigRow) =>
  mockRefresh.mockImplementationOnce(async () => {
    setCachedLocalAiConfigRow(row);
    return row;
  });

const vectorOf = (dims: number) => Array.from({ length: dims }, (_, i) => i / dims);

describe('localEmbed', () => {
  afterEach(() => {
    delete process.env.OLLAMA_EMBED_DIMS;
    delete process.env.OLLAMA_EMBED_MODEL;
  });

  it('warms the DB config cache before resolving the config', async () => {
    warmWith({ embed_model: 'db-embed', embed_dims: 768 });
    const result = await localEmbed([]);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ vectors: [], totalTokens: 0, model: 'db-embed', dims: 768 });
  });

  it('short-circuits on an empty input without calling Ollama', async () => {
    const result = await localEmbed([]);
    expect(mockedEmbed).not.toHaveBeenCalled();
    expect(result).toEqual({ vectors: [], totalTokens: 0, model: 'bge-m3', dims: 1024 });
  });

  it('splits a large input into batches and keeps vector order', async () => {
    // 70 texts at a batch size of 32 -> 32 / 32 / 6.
    const texts = Array.from({ length: 70 }, (_, i) => `t${i}`);
    mockedEmbed.mockImplementation(async part => ({
      vectors: part.map(() => vectorOf(1024)),
      model: 'bge-m3',
      promptTokens: part.length,
      totalMs: 1,
      loadMs: 0,
    }));

    const result = await localEmbed(texts);

    expect(mockedEmbed).toHaveBeenCalledTimes(3);
    expect(mockedEmbed.mock.calls.map(c => c[0].length)).toEqual([32, 32, 6]);
    expect(result.vectors).toHaveLength(70);
    // Token counts are summed across every request, not taken from the first.
    expect(result.totalTokens).toBe(70);
  });

  it('returns vectors with the model that actually produced them', async () => {
    mockedEmbed.mockResolvedValue({
      vectors: [vectorOf(1024), vectorOf(1024)],
      model: 'bge-m3',
      promptTokens: 42,
      totalMs: 10,
      loadMs: 0,
    });

    const result = await localEmbed(['a', 'b']);
    expect(result.model).toBe('bge-m3');
    expect(result.dims).toBe(1024);
    expect(result.totalTokens).toBe(42);
    expect(result.vectors).toHaveLength(2);
  });

  it('throws when Ollama returns fewer vectors than inputs', async () => {
    mockedEmbed.mockResolvedValue({
      vectors: [vectorOf(1024)],
      model: 'bge-m3',
      promptTokens: 1,
      totalMs: 1,
      loadMs: 0,
    });
    await expect(localEmbed(['a', 'b'])).rejects.toThrow(/returned 1 embeddings for 2 inputs/);
  });

  // Without this the mismatch only surfaces later as an opaque Postgres error.
  it('throws on a dimension mismatch against the configured width', async () => {
    mockedEmbed.mockResolvedValue({
      vectors: [vectorOf(384)],
      model: 'nomic-embed-text',
      promptTokens: 1,
      totalMs: 1,
      loadMs: 0,
    });
    await expect(localEmbed(['a'])).rejects.toThrow(
      /returned 384, configured OLLAMA_EMBED_DIMS is 1024/
    );
  });
});

describe('localEmbeddingProvider', () => {
  it('reflects the current env configuration', () => {
    process.env.OLLAMA_EMBED_MODEL = 'other-model';
    process.env.OLLAMA_EMBED_DIMS = '768';
    expect(localEmbeddingProvider.model).toBe('other-model');
    expect(localEmbeddingProvider.dims).toBe(768);
    delete process.env.OLLAMA_EMBED_MODEL;
    delete process.env.OLLAMA_EMBED_DIMS;
  });

  // The getters are sync, so they see whatever an async entry point last cached.
  it('reflects the cached DB row', () => {
    setCachedLocalAiConfigRow({ embed_model: 'db-embed', embed_dims: 768 });
    expect(localEmbeddingProvider.model).toBe('db-embed');
    expect(localEmbeddingProvider.dims).toBe(768);
  });
});
