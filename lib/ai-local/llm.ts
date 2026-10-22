import { ollamaChat, type OllamaChatResult } from '@/lib/ai-local/ollama-client';
import { resolveLocalAiConfig } from '@/lib/ai-local/config';
import { refreshLocalAiConfig } from '@/lib/ai-local/config-repo';
import { buildGroundingBlock } from '@/lib/ai-local/citations';
import type { LlmProvider, LlmRequest, LlmResult } from '@/lib/ai/types';

/** Strips markdown fences a model sometimes adds even under a schema. */
export function parseJsonLoose<T>(raw: string): T | null {
  try {
    return JSON.parse(raw.replace(/```json\n?|```/g, '').trim()) as T;
  } catch {
    return null;
  }
}

/**
 * Grounding reaches a local model as text. `prompts/grading-system-prompt.txt`
 * is frozen and tells the model to search a Vector Store that does not exist
 * here, so the block is appended after it to supersede that instruction.
 */
export function buildSystemPrompt(request: LlmRequest): string {
  if (request.grounding?.kind !== 'passages') return request.system;
  return request.system + '\n' + buildGroundingBlock(request.grounding.passages);
}

export async function localCompleteJson<T>(request: LlmRequest): Promise<LlmResult<T>> {
  await refreshLocalAiConfig();
  const config = resolveLocalAiConfig();
  const system = buildSystemPrompt(request);

  // config-v1.4 sets max_tokens to 20000, which maps to num_predict. Under
  // schema-constrained decoding a cut-off severs the object mid-token and is
  // guaranteed to fail JSON.parse, so the local ceiling is the tighter
  // num_predict rather than the config value.
  const numPredict = config.numPredict;

  const attempts: OllamaChatResult[] = [];
  let data: T | null = null;
  let temperature = request.temperature;

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await ollamaChat(
      { system, user: request.user, schema: request.schema, temperature, numPredict },
      config
    );
    attempts.push(result);

    if (result.truncated) break;

    data = parseJsonLoose<T>(result.content);
    if (data !== null) break;

    // One deterministic retry. Sampling noise is the most common cause of a
    // malformed object, and temperature 0 removes it. Retrying at the original
    // temperature would mostly reproduce the same failure.
    if (temperature === 0) break;
    console.warn('[ollama] response did not parse as JSON, retrying once at temperature 0');
    temperature = 0;
  }

  const last = attempts[attempts.length - 1];
  const sum = (pick: (r: OllamaChatResult) => number) => attempts.reduce((t, r) => t + pick(r), 0);

  const status = last.truncated ? 'incomplete' : 'completed';
  const promptTokens = sum(r => r.promptTokens);
  const completionTokens = sum(r => r.completionTokens);

  if (status === 'completed' && data === null) {
    console.error('Failed to parse AI response:', last.content);
  }

  return {
    status,
    // Same vocabulary as the OpenAI Responses API so audit rows stay comparable
    // across providers.
    rawStatus: status,
    data,
    rawText: last.content,
    model: last.model,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    // Wall time across every attempt — an automatic retry is real cost and
    // must not be hidden from the latency figures.
    latencyMs: Math.round(sum(r => r.totalMs)),
    loadMs: Math.round(sum(r => r.loadMs)),
    tokensPerSec: last.tokensPerSec,
    ...(last.truncated
      ? {
          error:
            `Generation stopped at the ${numPredict}-token limit (done_reason=length), ` +
            `so the JSON object is incomplete. Raise OLLAMA_NUM_PREDICT if this recurs.`,
        }
      : {}),
    ...(attempts.length > 1 ? { retriedAtZeroTemperature: true } : {}),
  };
}

export const localLlmProvider: LlmProvider = { completeJson: localCompleteJson };
