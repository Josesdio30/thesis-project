import { getOpenAI } from '@/lib/openai';
import type { LlmProvider, LlmRequest, LlmResult, LlmStatus } from '@/lib/ai/types';

const KNOWN_STATUSES: readonly string[] = ['completed', 'incomplete', 'failed'];

function normalizeStatus(raw: string): LlmStatus {
  return (KNOWN_STATUSES.includes(raw) ? raw : 'failed') as LlmStatus;
}

/** Strips markdown fences the model sometimes wraps JSON in. */
export function parseJsonLoose<T>(raw: string): T | null {
  try {
    return JSON.parse(raw.replace(/```json\n?|```/g, '').trim()) as T;
  } catch {
    return null;
  }
}

/**
 * Single Responses API call. Grounding, when present, is `native` — the vector
 * store ids go to the `file_search` tool and OpenAI does retrieval server-side.
 */
export async function openaiCompleteJson<T>(request: LlmRequest): Promise<LlmResult<T>> {
  const openai = await getOpenAI();
  const config = await import('@/lib/ai-config').then(m => m.getEffectiveAiConfig());

  const grounding = request.grounding;
  const tools =
    grounding?.kind === 'native'
      ? [{ type: 'file_search' as const, vector_store_ids: grounding.vectorStoreIds }]
      : undefined;

  const startedAt = Date.now();
  const response = await openai.responses.create({
    model: config.model,
    instructions: request.system,
    input: request.user,
    temperature: request.temperature,
    ...(request.maxTokens ? { max_output_tokens: request.maxTokens } : {}),
    ...(tools ? { tools } : {}),
    store: false,
    text: { format: { type: 'json_object' as const } },
  });
  const latencyMs = Date.now() - startedAt;

  const rawStatus = String(response.status);
  const status = normalizeStatus(rawStatus);
  const rawText = status === 'completed' ? response.output_text : '';
  const data = status === 'completed' ? parseJsonLoose<T>(rawText) : null;

  if (status === 'completed' && data === null) {
    console.error('Failed to parse AI response:', rawText);
  }

  const promptTokens = response.usage?.input_tokens ?? 0;
  const completionTokens = response.usage?.output_tokens ?? 0;

  return {
    status,
    rawStatus,
    data,
    rawText,
    model: config.model,
    promptTokens,
    completionTokens,
    totalTokens: response.usage?.total_tokens ?? 0,
    latencyMs,
    // OpenAI is a hosted service: there is no local model load to separate out,
    // and per-token speed is not reported.
    loadMs: 0,
    tokensPerSec: 0,
    ...(response.error?.message ? { error: response.error.message } : {}),
  };
}

export const openaiLlmProvider: LlmProvider = { completeJson: openaiCompleteJson };
