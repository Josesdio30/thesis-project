/**
 * Provider-neutral seams for the two AI features (Automated Grading, Plagiarism
 * Detection). Exactly three capabilities are abstracted — embeddings, JSON
 * completion, and retrieval — so the OpenAI baseline and the local Ollama path
 * can be swapped with `AI_PROVIDER` and compared on identical datasets.
 */

export type ProviderName = 'openai' | 'local';

/* ── Embeddings ─────────────────────────────────────────────────────────── */

export interface EmbeddingBatch {
  vectors: number[][];
  totalTokens: number;
  /** Model that actually produced the vectors. Persisted alongside them so a
   *  row never has to be trusted to a hardcoded constant. */
  model: string;
  /** Vector width, asserted against the target column before insert. */
  dims: number;
}

export interface EmbeddingProvider {
  readonly model: string;
  readonly dims: number;
  embed(texts: string[]): Promise<EmbeddingBatch>;
}

/* ── Retrieval / grounding ──────────────────────────────────────────────── */

export interface RetrievedPassage {
  /** Prompt-facing label, `M1`..`Mk`, used to verify citations afterwards. */
  label: string;
  text: string;
  /** Human locator inside the source document, e.g. `p. 12` / `slide 4`. */
  locator: string;
  documentName: string;
  score: number;
}

/**
 * How grounding reaches the model. OpenAI resolves course materials
 * server-side via `file_search`; the local path retrieves passages itself and
 * injects them into the prompt.
 */
export type GroundingHandle =
  | { kind: 'passages'; passages: RetrievedPassage[] }
  | { kind: 'native'; vectorStoreIds: string[] };

export interface RetrievalQuery {
  /** Vector store id (OpenAI) or `rag_corpora.id` (local). */
  corpusRef: string;
  queryText: string;
  topK?: number;
}

export interface RetrievalResult {
  grounding: GroundingHandle;
  retrievalMs: number;
}

export interface RetrievalProvider {
  retrieve(query: RetrievalQuery): Promise<RetrievalResult>;
}

/* ── LLM ────────────────────────────────────────────────────────────────── */

/** Deliberately the same vocabulary as the OpenAI Responses API so audit rows
 *  stay comparable across providers (see R4 in the plan). */
export type LlmStatus = 'completed' | 'incomplete' | 'failed';

export interface LlmRequest {
  system: string;
  user: string;
  /** JSON Schema for constrained decoding. OpenAI falls back to `json_object`. */
  schema?: Record<string, unknown>;
  temperature: number;
  maxTokens: number | null;
  grounding?: GroundingHandle;
}

export interface LlmResult<T> {
  status: LlmStatus;
  /** The provider's own status string, preserved verbatim so audit rows and
   *  user-facing failure messages stay byte-identical to the baseline. */
  rawStatus: string;
  data: T | null;
  rawText: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  /** Model load time. Non-zero here means a cold start polluted `latencyMs`. */
  loadMs: number;
  tokensPerSec: number;
  error?: string;
  /** Set when the provider re-ran the call deterministically after the first
   *  response failed to parse. Counted in the validation report so a high
   *  retry rate cannot hide behind a healthy final parse rate. */
  retriedAtZeroTemperature?: boolean;
}

export interface LlmProvider {
  completeJson<T>(request: LlmRequest): Promise<LlmResult<T>>;
}

/* ── Provider bundle ────────────────────────────────────────────────────── */

export interface AiProvider {
  readonly name: ProviderName;
  readonly embeddings: EmbeddingProvider;
  readonly llm: LlmProvider;
  readonly retrieval: RetrievalProvider;
}
