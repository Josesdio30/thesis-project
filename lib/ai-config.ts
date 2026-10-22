import fs from 'fs';
import path from 'path';
import { getAiConfigRow } from '@/lib/db2/admin-repo';

export interface EffectiveAiConfig {
  model: string;
  temperature: number;
  maxTokens: number | null;
  systemPrompt: string;
}

function defaultSystemPrompt(): string {
  try {
    return fs.readFileSync(
      path.join(process.cwd(), 'prompts', 'grading-system-prompt.txt'),
      'utf-8'
    );
  } catch {
    return '';
  }
}

/**
 * The hardcoded defaults. These are the fallback values used when no admin
 * configuration exists, and the target of the "reset to default" controls.
 */
export function getAiConfigDefaults(): EffectiveAiConfig {
  return {
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: null,
    systemPrompt: defaultSystemPrompt(),
  };
}

/**
 * Resolve the AI grading parameters: the admin-configured ai_config row when
 * present, otherwise the hardcoded defaults.
 */
export async function getEffectiveAiConfig(): Promise<EffectiveAiConfig> {
  const defaults = getAiConfigDefaults();

  try {
    const row = await getAiConfigRow();
    if (row) {
      return {
        model: row.model,
        temperature: row.temperature,
        maxTokens: row.max_tokens,
        systemPrompt: row.system_prompt?.trim() ? row.system_prompt : defaults.systemPrompt,
      };
    }
  } catch (error) {
    console.error('[ai-config] failed to load ai_config, using defaults', error);
  }

  return defaults;
}
