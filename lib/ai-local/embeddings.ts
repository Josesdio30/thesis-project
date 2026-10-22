import { ollamaEmbed } from '@/lib/ai-local/ollama-client';
import { resolveLocalAiConfig } from '@/lib/ai-local/config';
import { refreshLocalAiConfig } from '@/lib/ai-local/config-repo';
import { batch, mapWithConcurrency } from '@/lib/ai-local/queue';
import type { EmbeddingBatch, EmbeddingProvider } from '@/lib/ai/types';

/**
 * One request per this many texts. A whole 40-page PDF in a single call is a
 * multi-megabyte body that Ollama processes serially with no progress and no
 * partial failure boundary; batching also lets two requests overlap.
 */
const EMBED_BATCH_SIZE = 32;

/**
 * Embeddings via Ollama. `bge-m3` is used without query/passage prefixes — it
 * is trained to work without them, which keeps chunk-vs-chunk comparison in the
 * plagiarism pipeline symmetric and leaves the cosine code untouched.
 */
export async function localEmbed(texts: string[]): Promise<EmbeddingBatch> {
  await refreshLocalAiConfig();
  const config = resolveLocalAiConfig();

  if (texts.length === 0) {
    return { vectors: [], totalTokens: 0, model: config.embedModel, dims: config.embedDims };
  }

  const results = await mapWithConcurrency(
    batch(texts, EMBED_BATCH_SIZE),
    config.embedConcurrency,
    part => ollamaEmbed(part, config)
  );

  // mapWithConcurrency preserves input order, so flattening keeps every vector
  // aligned with its text.
  const vectors = results.flatMap(r => r.vectors);
  const model = results[0].model;

  if (vectors.length !== texts.length) {
    throw new Error(
      `Ollama returned ${vectors.length} embeddings for ${texts.length} inputs (model ${model})`
    );
  }

  // Fail loudly on a dimension mismatch. Without this the error surfaces much
  // later as an opaque Postgres "expected N dimensions" on insert.
  const actualDims = vectors[0].length;
  if (actualDims !== config.embedDims) {
    throw new Error(
      `Embedding dimension mismatch: model "${model}" returned ${actualDims}, ` +
        `configured OLLAMA_EMBED_DIMS is ${config.embedDims}`
    );
  }

  return {
    vectors,
    totalTokens: results.reduce((total, r) => total + r.promptTokens, 0),
    model,
    dims: actualDims,
  };
}

// The getters are sync and read the cached row; localEmbed keeps it warm.
export const localEmbeddingProvider: EmbeddingProvider = {
  get model() {
    return resolveLocalAiConfig().embedModel;
  },
  get dims() {
    return resolveLocalAiConfig().embedDims;
  },
  embed: localEmbed,
};
