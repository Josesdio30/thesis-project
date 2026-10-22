import { openaiEmbed, openaiEmbeddingProvider, OPENAI_EMBEDDING_MODEL, OPENAI_EMBEDDING_DIMS } from '@/lib/ai/openai/embeddings';
import { getOpenAI } from '@/lib/openai';

const mockCreate = jest.fn();
jest.mock('@/lib/openai', () => ({ getOpenAI: jest.fn() }));
(getOpenAI as jest.Mock).mockResolvedValue({ embeddings: { create: mockCreate } });

const apiError = (status: number) => Object.assign(new Error(`boom ${status}`), { status });

describe('openaiEmbed', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.useRealTimers());

  it('pins the frozen baseline model and dimensions', () => {
    // These two values ARE the provenance of the published plagiarism results.
    expect(OPENAI_EMBEDDING_MODEL).toBe('text-embedding-3-small');
    expect(OPENAI_EMBEDDING_DIMS).toBe(384);
  });

  it('strips newlines and reports the model that produced the vectors', async () => {
    mockCreate.mockResolvedValue({
      data: [{ embedding: [0.2], index: 1 }, { embedding: [0.1], index: 0 }],
      usage: { total_tokens: 7 },
    });

    const result = await openaiEmbed(['a\nb', 'c']);

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: ['a b', 'c'],
      encoding_format: 'float',
      dimensions: 384,
    });
    // The API does not guarantee input order.
    expect(result.vectors).toEqual([[0.1], [0.2]]);
    expect(result).toMatchObject({ totalTokens: 7, model: 'text-embedding-3-small', dims: 384 });
  });

  it('retries on 429 then succeeds', async () => {
    mockCreate
      .mockRejectedValueOnce(apiError(429))
      .mockResolvedValue({ data: [{ embedding: [1], index: 0 }], usage: { total_tokens: 1 } });

    const promise = openaiEmbed(['x']);
    await jest.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({ vectors: [[1]] });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('gives up after five attempts on persistent 5xx', async () => {
    mockCreate.mockRejectedValue(apiError(503));
    const promise = openaiEmbed(['x']);
    const assertion = expect(promise).rejects.toThrow(/after 5 attempts/);
    await jest.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(mockCreate).toHaveBeenCalledTimes(5);
  });

  it('rethrows non-retryable errors immediately', async () => {
    mockCreate.mockRejectedValue(apiError(401));
    await expect(openaiEmbed(['x'])).rejects.toThrow('boom 401');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('treats a thrown value without a status as non-retryable', async () => {
    mockCreate.mockRejectedValue(null);
    await expect(openaiEmbed(['x'])).rejects.toBeNull();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('exposes the provider shape', () => {
    expect(openaiEmbeddingProvider.model).toBe('text-embedding-3-small');
    expect(openaiEmbeddingProvider.dims).toBe(384);
    expect(openaiEmbeddingProvider.embed).toBe(openaiEmbed);
  });
});
