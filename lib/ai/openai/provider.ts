import type { AiProvider } from '@/lib/ai/types';
import { openaiEmbeddingProvider } from '@/lib/ai/openai/embeddings';
import { openaiLlmProvider } from '@/lib/ai/openai/llm';
import { openaiRetrievalProvider } from '@/lib/ai/openai/retrieval';

export const openaiProvider: AiProvider = {
  name: 'openai',
  embeddings: openaiEmbeddingProvider,
  llm: openaiLlmProvider,
  retrieval: openaiRetrievalProvider,
};
