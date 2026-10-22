import type { RetrievalProvider, RetrievalQuery, RetrievalResult } from '@/lib/ai/types';

/**
 * OpenAI resolves grounding server-side through the `file_search` tool, so
 * there is nothing to retrieve here — the vector store id is handed straight
 * to the model. Retrieval latency is folded into the LLM call and reported
 * as 0 to keep it out of the local `retrieval_ms` metric.
 */
export const openaiRetrievalProvider: RetrievalProvider = {
  async retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    return {
      grounding: { kind: 'native', vectorStoreIds: [query.corpusRef] },
      retrievalMs: 0,
    };
  },
};
