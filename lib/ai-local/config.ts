/**
 * Local (Ollama) knobs.
 *
 * Resolution order is deliberately **env > DB row > default** — the inverse of
 * `ai_config`, where the DB wins. Rationale: the thesis validation harness has
 * to sweep models and context sizes across runs, and it must be able to do that
 * with environment variables alone, without mutating shared admin state.
 * `ai_config` stays the provider-neutral row (temperature / max_tokens /
 * system_prompt) and is never overwritten by the local path.
 */

export const SCORING_MODES = ['holistic', 'analytic'] as const;
export type ScoringMode = (typeof SCORING_MODES)[number];

export interface LocalAiConfig {
  baseUrl: string;
  chatModel: string;
  embedModel: string;
  embedDims: number;
  numCtx: number;
  numPredict: number;
  keepAlive: string;
  retrievalTopK: number;
  llmConcurrency: number;
  embedConcurrency: number;
  /** Env-only, like the concurrency knobs: a study setting, not admin state. */
  scoringMode: ScoringMode;
  /** Env-only. null sends no `think` flag, so models without a thinking mode get
   *  exactly the request they always did; false stops qwen3.5/gemma4 from
   *  reasoning before the JSON answer. */
  think: boolean | null;
}

/** Persisted `local_ai_config` singleton (`db/ai-db/local/010_local_ai_config.sql`). */
export interface LocalAiConfigRow {
  base_url?: string | null;
  chat_model?: string | null;
  embed_model?: string | null;
  embed_dims?: number | null;
  num_ctx?: number | null;
  num_predict?: number | null;
  keep_alive?: string | null;
  retrieval_top_k?: number | null;
  updated_at?: Date | string | null;
}

/** Where each resolved value came from, so the admin UI can show an env override. */
export type LocalAiConfigSource = 'env' | 'db' | 'default';
export type LocalAiConfigSources = Record<keyof LocalAiConfig, LocalAiConfigSource>;

export const LOCAL_AI_DEFAULTS: LocalAiConfig = {
  baseUrl: 'http://localhost:11434',
  chatModel: 'qwen2.5:14b-instruct-q4_K_M',
  embedModel: 'bge-m3',
  embedDims: 1024,
  numCtx: 8192,
  numPredict: 1536,
  keepAlive: '30m',
  retrievalTopK: 6,
  llmConcurrency: 1,
  embedConcurrency: 2,
  scoringMode: 'holistic',
  think: null,
};

function envInt(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

function envStr(name: string): string | undefined {
  const raw = process.env[name];
  return raw !== undefined && raw.trim() !== '' ? raw.trim() : undefined;
}

function envScoringMode(): ScoringMode | undefined {
  const raw = envStr('LOCAL_SCORING_MODE');
  if (raw === undefined) return undefined;
  if (!(SCORING_MODES as readonly string[]).includes(raw)) {
    throw new Error(`LOCAL_SCORING_MODE must be one of ${SCORING_MODES.join(', ')}, got "${raw}"`);
  }
  return raw as ScoringMode;
}

function envThink(): boolean | undefined {
  const raw = envStr('OLLAMA_THINK');
  if (raw === undefined) return undefined;
  const value = raw.toLowerCase();
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new Error(`OLLAMA_THINK must be true or false, got "${raw}"`);
}

/** First non-nullish candidate, else the (always present) default. */
function pick<T>(candidates: (T | null | undefined)[], fallback: T): T {
  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined) return candidate;
  }
  return fallback;
}

/**
 * Last row loaded by `lib/ai-local/config-repo.ts`. Kept here rather than in the
 * repo so resolution stays synchronous and this module stays free of DB
 * imports: the async entry points warm the cache, and every sync call site
 * (including the embedding provider's getters) reads it.
 */
let cachedRow: LocalAiConfigRow | null = null;

export function setCachedLocalAiConfigRow(row: LocalAiConfigRow | null): void {
  cachedRow = row;
}

export function getCachedLocalAiConfigRow(): LocalAiConfigRow | null {
  return cachedRow;
}

function sourceOf(envValue: unknown, rowValue: unknown): LocalAiConfigSource {
  if (envValue !== undefined) return 'env';
  return rowValue !== null && rowValue !== undefined ? 'db' : 'default';
}

export function resolveLocalAiConfig(
  row: LocalAiConfigRow | null | undefined = getCachedLocalAiConfigRow()
): LocalAiConfig {
  const d = LOCAL_AI_DEFAULTS;
  return {
    baseUrl: pick([envStr('OLLAMA_BASE_URL'), row?.base_url], d.baseUrl).replace(/\/+$/, ''),
    chatModel: pick([envStr('OLLAMA_CHAT_MODEL'), row?.chat_model], d.chatModel),
    embedModel: pick([envStr('OLLAMA_EMBED_MODEL'), row?.embed_model], d.embedModel),
    embedDims: pick([envInt('OLLAMA_EMBED_DIMS'), row?.embed_dims], d.embedDims),
    numCtx: pick([envInt('OLLAMA_NUM_CTX'), row?.num_ctx], d.numCtx),
    numPredict: pick([envInt('OLLAMA_NUM_PREDICT'), row?.num_predict], d.numPredict),
    keepAlive: pick([envStr('OLLAMA_KEEP_ALIVE'), row?.keep_alive], d.keepAlive),
    retrievalTopK: pick([envInt('LOCAL_RAG_TOP_K'), row?.retrieval_top_k], d.retrievalTopK),
    llmConcurrency: pick([envInt('LOCAL_LLM_CONCURRENCY')], d.llmConcurrency),
    embedConcurrency: pick([envInt('LOCAL_EMBED_CONCURRENCY')], d.embedConcurrency),
    scoringMode: pick([envScoringMode()], d.scoringMode),
    think: envThink() ?? d.think,
  };
}

/** Mirrors `resolveLocalAiConfig` key by key; the concurrency and scoring-mode knobs have no DB column. */
export function resolveLocalAiConfigSources(
  row: LocalAiConfigRow | null | undefined = getCachedLocalAiConfigRow()
): LocalAiConfigSources {
  return {
    baseUrl: sourceOf(envStr('OLLAMA_BASE_URL'), row?.base_url),
    chatModel: sourceOf(envStr('OLLAMA_CHAT_MODEL'), row?.chat_model),
    embedModel: sourceOf(envStr('OLLAMA_EMBED_MODEL'), row?.embed_model),
    embedDims: sourceOf(envInt('OLLAMA_EMBED_DIMS'), row?.embed_dims),
    numCtx: sourceOf(envInt('OLLAMA_NUM_CTX'), row?.num_ctx),
    numPredict: sourceOf(envInt('OLLAMA_NUM_PREDICT'), row?.num_predict),
    keepAlive: sourceOf(envStr('OLLAMA_KEEP_ALIVE'), row?.keep_alive),
    retrievalTopK: sourceOf(envInt('LOCAL_RAG_TOP_K'), row?.retrieval_top_k),
    llmConcurrency: sourceOf(envInt('LOCAL_LLM_CONCURRENCY'), undefined),
    embedConcurrency: sourceOf(envInt('LOCAL_EMBED_CONCURRENCY'), undefined),
    scoringMode: sourceOf(envScoringMode(), undefined),
    think: sourceOf(envThink(), undefined),
  };
}
