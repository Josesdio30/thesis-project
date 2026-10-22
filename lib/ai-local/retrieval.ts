import { localEmbed } from '@/lib/ai-local/embeddings';
import { resolveLocalAiConfig } from '@/lib/ai-local/config';
import { refreshLocalAiConfig } from '@/lib/ai-local/config-repo';
import { searchCorpus } from '@/lib/ai-local/rag/repo';
import type { RetrievalProvider, RetrievalQuery, RetrievalResult, RetrievedPassage } from '@/lib/ai/types';

/**
 * Longer queries stop helping and start costing context. The rubric criteria
 * and question text carry most of the retrieval signal; a long student answer
 * would otherwise dominate the vector.
 */
const MAX_QUERY_CHARS = 2000;

/**
 * Local retrieval: embed the query, take the nearest chunks from the
 * assignment's corpus, and label them M1..Mk. The labels are what makes
 * citations verifiable — `lib/ai-local/citations.ts` later cross-checks what
 * the model emitted against what was actually retrieved.
 */
export async function localRetrieve(query: RetrievalQuery): Promise<RetrievalResult> {
  await refreshLocalAiConfig();
  const config = resolveLocalAiConfig();
  const topK = query.topK ?? config.retrievalTopK;
  const startedAt = Date.now();

  const text = query.queryText.slice(0, MAX_QUERY_CHARS).trim();
  if (!text) {
    return { grounding: { kind: 'passages', passages: [] }, retrievalMs: Date.now() - startedAt };
  }

  const { vectors } = await localEmbed([text]);
  const rows = await searchCorpus(query.corpusRef, vectors[0], topK);

  const passages: RetrievedPassage[] = rows.map((row, index) => ({
    label: `M${index + 1}`,
    text: row.content,
    locator: row.locator,
    documentName: row.file_name,
    score: Number(row.similarity),
  }));

  return { grounding: { kind: 'passages', passages }, retrievalMs: Date.now() - startedAt };
}

export const localRetrievalProvider: RetrievalProvider = { retrieve: localRetrieve };
