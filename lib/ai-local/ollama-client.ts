/**
 * The only place in the codebase that speaks HTTP to Ollama.
 *
 * Everything subtle about the local path lives here: nanosecond durations,
 * silent-truncation defaults, and the difference between "the model ran out of
 * output budget" and "the model emitted invalid JSON".
 */
import { resolveLocalAiConfig, type LocalAiConfig } from '@/lib/ai-local/config';

const EMBED_TIMEOUT_MS = 120_000;
/** Cold-loading a 14B quant can take 20-40 s before the first token. */
const CHAT_TIMEOUT_MS = 300_000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Ollama reports every duration in nanoseconds. */
export function nsToMs(ns: number | undefined): number {
  return typeof ns === 'number' && Number.isFinite(ns) ? ns / 1e6 : 0;
}

export function tokensPerSecond(evalCount?: number, evalDurationNs?: number): number {
  if (!evalCount || !evalDurationNs) return 0;
  return evalCount / (evalDurationNs / 1e9);
}

export class OllamaError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}

function modelMissingHint(body: string, model: string): string | null {
  return /not found|no such model|pull the model/i.test(body)
    ? `Model "${model}" is not available in Ollama. Run:\n\n    ollama pull ${model}\n`
    : null;
}

interface RequestOptions {
  path: string;
  body: unknown;
  timeoutMs: number;
  model: string;
  config: LocalAiConfig;
}

async function ollamaFetch<T>({ path, body, timeoutMs, model, config }: RequestOptions): Promise<T> {
  let attempt = 0;

  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${config.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        // 4xx is a configuration fault (missing model, bad request). Retrying
        // just delays a failure the operator has to fix by hand.
        const retryable = response.status >= 500;
        const hint = modelMissingHint(text, model);
        throw new OllamaError(
          hint ?? `Ollama ${path} failed with ${response.status}: ${text.slice(0, 500)}`,
          response.status,
          retryable
        );
      }

      return (await response.json()) as T;
    } catch (error: any) {
      const isAbort = error?.name === 'AbortError';
      const isConnRefused =
        error?.cause?.code === 'ECONNREFUSED' || /ECONNREFUSED|fetch failed/i.test(error?.message ?? '');
      const retryable = error instanceof OllamaError ? error.retryable : isConnRefused;

      attempt++;
      if (!retryable || attempt >= MAX_RETRIES) {
        if (isAbort) {
          throw new OllamaError(`Ollama ${path} timed out after ${timeoutMs}ms`, null, false);
        }
        if (isConnRefused && attempt >= MAX_RETRIES) {
          throw new OllamaError(
            `Cannot reach Ollama at ${config.baseUrl}. Is it running? Try:\n\n    ollama serve\n`,
            null,
            false
          );
        }
        throw error;
      }

      const waitTime = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      console.warn(`[ollama] ${path} failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${waitTime}ms`);
      await delay(waitTime);
    } finally {
      clearTimeout(timer);
    }
  }
}

/* ── /api/embed ─────────────────────────────────────────────────────────── */

interface OllamaEmbedResponse {
  model: string;
  embeddings: number[][];
  prompt_eval_count?: number;
  total_duration?: number;
  load_duration?: number;
}

export interface OllamaEmbedResult {
  vectors: number[][];
  model: string;
  promptTokens: number;
  totalMs: number;
  loadMs: number;
}

export async function ollamaEmbed(
  texts: string[],
  config: LocalAiConfig = resolveLocalAiConfig()
): Promise<OllamaEmbedResult> {
  const response = await ollamaFetch<OllamaEmbedResponse>({
    // `/api/embed` (plural-input) — NOT the legacy `/api/embeddings`.
    path: '/api/embed',
    body: {
      model: config.embedModel,
      input: texts,
      // Ollama defaults this to `true`, which silently drops the tail of any
      // over-length input. A truncated chunk would corrupt similarity scores
      // with no trace in the output, so we force a hard error instead.
      truncate: false,
      keep_alive: config.keepAlive,
      options: { num_ctx: config.numCtx },
    },
    timeoutMs: EMBED_TIMEOUT_MS,
    model: config.embedModel,
    config,
  });

  return {
    vectors: response.embeddings ?? [],
    model: response.model ?? config.embedModel,
    promptTokens: response.prompt_eval_count ?? 0,
    totalMs: nsToMs(response.total_duration),
    loadMs: nsToMs(response.load_duration),
  };
}

/* ── /api/chat ──────────────────────────────────────────────────────────── */

interface OllamaChatResponse {
  model: string;
  message?: { role: string; content: string };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
  load_duration?: number;
}

export interface OllamaChatResult {
  content: string;
  model: string;
  /** `true` when generation stopped because `num_predict` ran out. Under
   *  schema-constrained decoding this guarantees a mid-object cut and therefore
   *  a JSON parse failure — reporting it as a parse error would make the real
   *  cause undiagnosable. */
  truncated: boolean;
  doneReason: string;
  promptTokens: number;
  completionTokens: number;
  totalMs: number;
  loadMs: number;
  tokensPerSec: number;
}

export interface OllamaChatParams {
  system: string;
  user: string;
  /** JSON Schema — enables grammar-constrained decoding, far stronger than
   *  asking the model for JSON in the prompt. */
  schema?: Record<string, unknown>;
  temperature: number;
  numPredict?: number;
}

export async function ollamaChat(
  params: OllamaChatParams,
  config: LocalAiConfig = resolveLocalAiConfig()
): Promise<OllamaChatResult> {
  const response = await ollamaFetch<OllamaChatResponse>({
    path: '/api/chat',
    body: {
      model: config.chatModel,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
      ...(params.schema ? { format: params.schema } : {}),
      ...(config.think !== null ? { think: config.think } : {}),
      stream: false,
      keep_alive: config.keepAlive,
      options: {
        temperature: params.temperature,
        num_ctx: config.numCtx,
        num_predict: params.numPredict ?? config.numPredict,
        seed: 0,
      },
    },
    timeoutMs: CHAT_TIMEOUT_MS,
    model: config.chatModel,
    config,
  });

  const doneReason = response.done_reason ?? 'stop';

  return {
    content: response.message?.content ?? '',
    model: response.model ?? config.chatModel,
    truncated: doneReason === 'length',
    doneReason,
    promptTokens: response.prompt_eval_count ?? 0,
    completionTokens: response.eval_count ?? 0,
    totalMs: nsToMs(response.total_duration),
    loadMs: nsToMs(response.load_duration),
    tokensPerSec: tokensPerSecond(response.eval_count, response.eval_duration),
  };
}

/* ── health / preflight ─────────────────────────────────────────────────── */

export interface OllamaTag {
  name: string;
  size?: number;
}

export async function ollamaTags(
  config: LocalAiConfig = resolveLocalAiConfig()
): Promise<OllamaTag[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${config.baseUrl}/api/tags`, { signal: controller.signal });
    if (!response.ok) {
      throw new OllamaError(`Ollama /api/tags failed with ${response.status}`, response.status, false);
    }
    const json = (await response.json()) as { models?: OllamaTag[] };
    return json.models ?? [];
  } finally {
    clearTimeout(timer);
  }
}

export interface OllamaHealth {
  reachable: boolean;
  baseUrl: string;
  installedModels: string[];
  missingModels: string[];
  error?: string;
}

/**
 * Checks Ollama is up and the required models are pulled. Model names match on
 * the exact tag or on the bare name, since `bge-m3` and `bge-m3:latest` are the
 * same model.
 */
export async function preflight(
  required: string[],
  config: LocalAiConfig = resolveLocalAiConfig()
): Promise<OllamaHealth> {
  try {
    const tags = await ollamaTags(config);
    const installed = tags.map(t => t.name);
    const normalize = (name: string) => name.replace(/:latest$/, '');
    const installedNormalized = new Set(installed.map(normalize));

    return {
      reachable: true,
      baseUrl: config.baseUrl,
      installedModels: installed,
      missingModels: required.filter(m => !installedNormalized.has(normalize(m))),
    };
  } catch (error: any) {
    return {
      reachable: false,
      baseUrl: config.baseUrl,
      installedModels: [],
      missingModels: required,
      error: error?.message ?? String(error),
    };
  }
}
