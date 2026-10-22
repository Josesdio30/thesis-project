/**
 * These functions are now a thin delegator over the active AI provider. The
 * OpenAI retry/backoff behaviour they used to own was not deleted — it moved
 * to `lib/ai/openai/embeddings.ts` and is covered by
 * `tests/ai/openai/embeddings.test.ts`. What matters here is that the
 * delegation is faithful and that the reported model reaches the caller.
 */
import { generateEmbedding, generateEmbeddingsBatch, storeEmbedding } from '@/lib/plagiarism/embeddings';
import { getAiProvider } from '@/lib/ai';
import { insertEmbedding } from '@/lib/db2/pds-repo';

jest.mock('@/lib/ai', () => ({ getAiProvider: jest.fn() }));
jest.mock('@/lib/db2/pds-repo', () => ({ insertEmbedding: jest.fn() }));

const mockEmbed = jest.fn();
const mockedGetProvider = getAiProvider as jest.MockedFunction<typeof getAiProvider>;
const mockedInsert = insertEmbedding as jest.MockedFunction<typeof insertEmbedding>;

beforeEach(() => {
  mockEmbed.mockReset();
  mockedGetProvider.mockReturnValue({
    name: 'openai',
    embeddings: { model: 'text-embedding-3-small', dims: 384, embed: mockEmbed },
  } as unknown as ReturnType<typeof getAiProvider>);
});

describe('generateEmbedding', () => {
  it('delegates a single text and unwraps the first vector', async () => {
    mockEmbed.mockResolvedValue({
      vectors: [[0.1, 0.2, 0.3]],
      totalTokens: 10,
      model: 'text-embedding-3-small',
      dims: 384,
    });

    const result = await generateEmbedding('test text');

    expect(mockEmbed).toHaveBeenCalledWith(['test text']);
    expect(result).toEqual({ vector: [0.1, 0.2, 0.3], tokenCount: 10 });
  });

  it('replaces newlines with spaces before embedding', async () => {
    mockEmbed.mockResolvedValue({ vectors: [[0.1]], totalTokens: 1, model: 'm', dims: 1 });
    await generateEmbedding('line one\nline two');
    expect(mockEmbed).toHaveBeenCalledWith(['line one line two']);
  });

  it('propagates provider failures rather than swallowing them', async () => {
    mockEmbed.mockRejectedValue(new Error('provider exploded'));
    await expect(generateEmbedding('x')).rejects.toThrow('provider exploded');
  });
});

describe('generateEmbeddingsBatch', () => {
  it('passes the batch through and returns the model and dims', async () => {
    mockEmbed.mockResolvedValue({
      vectors: [[0.1], [0.2]],
      totalTokens: 20,
      model: 'bge-m3',
      dims: 1024,
    });

    const result = await generateEmbeddingsBatch(['a', 'b']);

    expect(mockEmbed).toHaveBeenCalledWith(['a', 'b']);
    // The model must survive the hop: detection.ts persists this value instead
    // of the constant it used to hardcode.
    expect(result).toEqual({ vectors: [[0.1], [0.2]], totalTokens: 20, model: 'bge-m3', dims: 1024 });
  });
});

describe('storeEmbedding', () => {
  it('defaults the model to the active provider', async () => {
    mockedInsert.mockResolvedValue(undefined as never);
    await storeEmbedding('chunk-1', [0.1, 0.2]);
    expect(mockedInsert).toHaveBeenCalledWith('chunk-1', [0.1, 0.2], 'text-embedding-3-small', undefined);
  });

  it('forwards an explicit model and table set', async () => {
    mockedInsert.mockResolvedValue(undefined as never);
    const tables = { chunks: 'pds_local_chunks' } as never;
    await storeEmbedding('chunk-1', [0.1], 'bge-m3', tables);
    expect(mockedInsert).toHaveBeenCalledWith('chunk-1', [0.1], 'bge-m3', tables);
  });

  it('wraps a DB failure with the chunk id', async () => {
    mockedInsert.mockRejectedValue(new Error('DB2 down'));
    await expect(storeEmbedding('chunk-9', [0.1])).rejects.toThrow(
      'Failed to store embedding for chunk chunk-9: DB2 down'
    );
  });
});
