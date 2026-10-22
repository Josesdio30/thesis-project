/**
 * Thin delegator over the active embedding provider.
 *
 * The OpenAI retry/backoff loop was not deleted — it moved verbatim to
 * `lib/ai/openai/embeddings.ts`, where it still runs for `AI_PROVIDER=openai`.
 */
import { getAiProvider } from '@/lib/ai';
import { insertEmbedding } from '@/lib/db2/pds-repo';
import type { PdsTableSet } from '@/lib/db2/pds-repo';

interface EmbeddingResult {
  vector: number[];
  tokenCount: number;
}

export interface BatchEmbeddingResult {
  vectors: number[][];
  totalTokens: number;
  /** The model that actually produced these vectors. Callers persist this
   *  instead of assuming a constant, which is what let the old code hardcode
   *  'text-embedding-3-small' onto rows a different model had generated. */
  model: string;
  dims: number;
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const { vectors, totalTokens } = await getAiProvider().embeddings.embed([text.replace(/\n/g, ' ')]);
  return { vector: vectors[0], tokenCount: totalTokens };
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<BatchEmbeddingResult> {
  return getAiProvider().embeddings.embed(texts);
}

/**
 * Stores a vector embedding in the provider's embeddings table.
 */
export async function storeEmbedding(
  chunkId: string,
  vector: number[],
  model: string = getAiProvider().embeddings.model,
  tables?: PdsTableSet
) {
  try {
    await insertEmbedding(chunkId, vector, model, tables);
  } catch (error: any) {
    throw new Error(`Failed to store embedding for chunk ${chunkId}: ${error.message}`);
  }
}
