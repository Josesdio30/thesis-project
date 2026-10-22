import { openaiRetrievalProvider } from '@/lib/ai/openai/retrieval';
import { openaiProvider } from '@/lib/ai/openai/provider';

describe('openaiRetrievalProvider', () => {
  // OpenAI does retrieval server-side inside `file_search`, so the corpus ref
  // is handed straight to the model and local retrieval time is zero.
  it('wraps the corpus ref as a native grounding handle', async () => {
    const result = await openaiRetrievalProvider.retrieve({ corpusRef: 'vs_42', queryText: 'q' });
    expect(result).toEqual({
      grounding: { kind: 'native', vectorStoreIds: ['vs_42'] },
      retrievalMs: 0,
    });
  });
});

describe('openaiProvider', () => {
  it('bundles all three seams under the openai name', () => {
    expect(openaiProvider.name).toBe('openai');
    expect(openaiProvider.retrieval).toBe(openaiRetrievalProvider);
    expect(openaiProvider.embeddings.dims).toBe(384);
  });
});
