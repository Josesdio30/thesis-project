import { localProvider } from '@/lib/ai-local/provider';
import { localEmbeddingProvider } from '@/lib/ai-local/embeddings';
import { localRetrievalProvider } from '@/lib/ai-local/retrieval';
import { localLlmProvider } from '@/lib/ai-local/llm';

describe('localProvider', () => {
  it('bundles all three seams under the local name', () => {
    expect(localProvider.name).toBe('local');
    expect(localProvider.embeddings).toBe(localEmbeddingProvider);
    expect(localProvider.retrieval).toBe(localRetrievalProvider);
    expect(localProvider.llm).toBe(localLlmProvider);
  });
});
