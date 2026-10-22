import type { AiProvider } from '@/lib/ai/types';
import { localEmbeddingProvider } from '@/lib/ai-local/embeddings';
import { localRetrievalProvider } from '@/lib/ai-local/retrieval';
import { localLlmProvider } from '@/lib/ai-local/llm';

export const localProvider: AiProvider = {
  name: 'local',
  embeddings: localEmbeddingProvider,
  llm: localLlmProvider,
  retrieval: localRetrievalProvider,
};
