import { getOpenAI } from '@/lib/openai';
import type { EmbeddingBatch, EmbeddingProvider } from '@/lib/ai/types';

/** Frozen baseline configuration — these two values ARE the provenance of the
 *  published plagiarism results and must not drift. */
export const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
export const OPENAI_EMBEDDING_DIMS = 384;

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isRetryable(error: { status?: number }): boolean {
  const status = error?.status;
  return status === 429 || (typeof status === 'number' && status >= 500 && status < 600);
}

/**
 * Batch embedding call with exponential backoff on 429/5xx. Moved verbatim
 * from `lib/plagiarism/embeddings.ts` so the baseline arm is unchanged.
 */
export async function openaiEmbed(texts: string[]): Promise<EmbeddingBatch> {
  let attempt = 0;
  const openai = await getOpenAI();

  // `for(;;)`: every exit is an explicit return or throw inside the body.
  for (;;) {
    try {
      const cleanTexts = texts.map(t => t.replace(/\n/g, ' '));

      const response = await openai.embeddings.create({
        model: OPENAI_EMBEDDING_MODEL,
        input: cleanTexts,
        encoding_format: 'float',
        dimensions: OPENAI_EMBEDDING_DIMS,
      });

      // Sort by index — the API does not guarantee input order.
      const sortedData = [...response.data].sort((a, b) => a.index - b.index);

      return {
        vectors: sortedData.map(item => item.embedding),
        totalTokens: response.usage.total_tokens,
        model: OPENAI_EMBEDDING_MODEL,
        dims: OPENAI_EMBEDDING_DIMS,
      };
    } catch (error: any) {
      attempt++;
      if (!isRetryable(error)) throw error;
      if (attempt >= MAX_RETRIES) {
        throw new Error(
          `Failed to generate batch embeddings after ${MAX_RETRIES} attempts: ${error.message}`
        );
      }
      const waitTime = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
      console.warn(
        `OpenAI API batch error ${error.status}. Retrying in ${waitTime}ms... (Attempt ${attempt}/${MAX_RETRIES})`
      );
      await delay(waitTime);
    }
  }

}

export const openaiEmbeddingProvider: EmbeddingProvider = {
  model: OPENAI_EMBEDDING_MODEL,
  dims: OPENAI_EMBEDDING_DIMS,
  embed: openaiEmbed,
};
