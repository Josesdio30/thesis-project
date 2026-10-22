import type { AiProvider, ProviderName } from '@/lib/ai/types';
import { openaiProvider } from '@/lib/ai/openai/provider';
import { localProvider } from '@/lib/ai-local/provider';

export * from '@/lib/ai/types';

const PROVIDERS: Readonly<Record<ProviderName, AiProvider>> = Object.freeze({
  openai: openaiProvider,
  local: localProvider,
});

/**
 * Reads `AI_PROVIDER`. Defaults to `openai` so the untouched main branch keeps
 * its existing behaviour; the local worktree sets `AI_PROVIDER=local`.
 *
 * Any other value is a hard error. A silent fallback here would be the worst
 * possible failure mode for the thesis: a run labelled "local" that quietly
 * billed OpenAI and produced baseline numbers.
 */
export function resolveProviderName(): ProviderName {
  const raw = (process.env.AI_PROVIDER ?? 'openai').trim().toLowerCase();
  if (raw !== 'openai' && raw !== 'local') {
    throw new Error(`Invalid AI_PROVIDER "${process.env.AI_PROVIDER}" (expected "openai" or "local")`);
  }
  return raw;
}

export function getAiProvider(name: ProviderName = resolveProviderName()): AiProvider {
  return PROVIDERS[name];
}
