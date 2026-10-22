/**
 * System prompt overrides for calibration studies.
 *
 * The grading prompt normally comes from the `ai_config` row, which is also the
 * frozen provenance record of the OpenAI config-v1.4 run and must not be edited.
 * A study points an env var at its own prompt file instead:
 *
 *   GRADING_PROMPT_FILE       both providers (same treatment for a fair comparison)
 *   LOCAL_SYSTEM_PROMPT_FILE  local only, and wins there (how local-v2 was frozen)
 *
 * The file is re-read on every call so calibration iterations need no restart;
 * the digest written to each audit row says exactly which prompt produced a result.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface LocalPromptOverride {
  text: string;
  file: string;
  sha256: string;
}

export function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

type Env = Record<string, string | undefined>;

function readPromptFile(variable: string, env: Env): LocalPromptOverride | null {
  const configured = env[variable]?.trim();
  if (!configured) return null;

  // Missing or empty is fatal: silently grading with the frozen prompt would
  // produce numbers labelled as a study config they never used.
  const file = path.resolve(process.cwd(), configured);
  if (!existsSync(file)) {
    throw new Error(`${variable} points to a missing file: ${configured}`);
  }
  const text = readFileSync(file, 'utf8');
  if (!text.trim()) {
    throw new Error(`${variable} ${configured} is empty`);
  }

  return { text, file: configured, sha256: sha256Text(text) };
}

export function resolveLocalSystemPrompt(env: Env = process.env): LocalPromptOverride | null {
  return readPromptFile('LOCAL_SYSTEM_PROMPT_FILE', env);
}

export function resolveSystemPromptOverride(
  provider: 'openai' | 'local',
  env: Env = process.env
): LocalPromptOverride | null {
  const local = provider === 'local' ? resolveLocalSystemPrompt(env) : null;
  return local ?? readPromptFile('GRADING_PROMPT_FILE', env);
}
