import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { resolveProviderName } from '@/lib/ai';
import {
  resolveLocalAiConfig,
  resolveLocalAiConfigSources,
  type LocalAiConfig,
  type LocalAiConfigRow,
} from '@/lib/ai-local/config';
import { refreshLocalAiConfig, updateLocalAiConfig, type LocalAiConfigPatch } from '@/lib/ai-local/config-repo';
import { preflight } from '@/lib/ai-local/ollama-client';
import { logAudit } from '@/lib/audit';

/** Mirrors the env lookups in `resolveLocalAiConfig`, so the UI can name the variable that wins. */
const ENV_VARS: Record<keyof LocalAiConfig, string> = {
  baseUrl: 'OLLAMA_BASE_URL',
  chatModel: 'OLLAMA_CHAT_MODEL',
  embedModel: 'OLLAMA_EMBED_MODEL',
  embedDims: 'OLLAMA_EMBED_DIMS',
  numCtx: 'OLLAMA_NUM_CTX',
  numPredict: 'OLLAMA_NUM_PREDICT',
  keepAlive: 'OLLAMA_KEEP_ALIVE',
  retrievalTopK: 'LOCAL_RAG_TOP_K',
  llmConcurrency: 'LOCAL_LLM_CONCURRENCY',
  embedConcurrency: 'LOCAL_EMBED_CONCURRENCY',
  scoringMode: 'LOCAL_SCORING_MODE',
  think: 'OLLAMA_THINK',
};

type EditableField = 'base_url' | 'chat_model' | 'num_ctx' | 'num_predict' | 'keep_alive' | 'retrieval_top_k';

const FIELD_KEYS: Record<EditableField, keyof LocalAiConfig> = {
  base_url: 'baseUrl',
  chat_model: 'chatModel',
  num_ctx: 'numCtx',
  num_predict: 'numPredict',
  keep_alive: 'keepAlive',
  retrieval_top_k: 'retrievalTopK',
};

const MODEL_TAG = /^[A-Za-z0-9._:/-]+$/;
const KEEP_ALIVE = /^(-1|0|\d+[smh])$/;

type Validated = { ok: true; value: string | number } | { ok: false; error: string };

function intInRange(field: string, value: unknown, min: number, max: number): Validated {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return { ok: false, error: `${field} must be an integer between ${min} and ${max}` };
  }
  return { ok: true, value };
}

// Messages name the field only: echoing input back would reflect whatever was posted.
const VALIDATORS: Record<EditableField, (value: unknown) => Validated> = {
  base_url: value => {
    const error = 'base_url must be an http(s) URL';
    if (typeof value !== 'string') return { ok: false, error };
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error };
    } catch {
      return { ok: false, error };
    }
    return { ok: true, value: value.trim().replace(/\/+$/, '') };
  },
  chat_model: value => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed.length === 0 || trimmed.length > 200 || !MODEL_TAG.test(trimmed)) {
      return {
        ok: false,
        error: 'chat_model must be an Ollama model tag of at most 200 characters (A-Z a-z 0-9 . _ : / -)',
      };
    }
    return { ok: true, value: trimmed };
  },
  num_ctx: value => intInRange('num_ctx', value, 512, 131072),
  num_predict: value => intInRange('num_predict', value, 64, 32768),
  keep_alive: value =>
    typeof value === 'string' && KEEP_ALIVE.test(value)
      ? { ok: true, value }
      : { ok: false, error: 'keep_alive must be -1, 0, or a duration such as 30s, 30m or 2h' },
  retrieval_top_k: value => intInRange('retrieval_top_k', value, 1, 20),
};

function isEditable(key: string): key is EditableField {
  return Object.prototype.hasOwnProperty.call(VALIDATORS, key);
}

function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

function payload(row: LocalAiConfigRow | null) {
  return {
    provider: resolveProviderName(),
    effective: resolveLocalAiConfig(row),
    sources: resolveLocalAiConfigSources(row),
    envVars: ENV_VARS,
    updated_at: row?.updated_at ?? null,
  };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  // Forced: the admin page must show the row as it is now, not as of the last TTL tick.
  const row = await refreshLocalAiConfig({ force: true });
  return NextResponse.json({ success: true, data: payload(row) });
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return badRequest('Body must be a JSON object');
  }

  const patch: LocalAiConfigPatch = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'embed_model' || key === 'embed_dims') {
      // The vector columns are fixed in the DDL; a new embedder would silently corrupt retrieval.
      return badRequest(
        `${key} cannot be changed here: rag_embeddings and pds_local_embeddings are VECTOR(1024), ` +
          'so a different embedding model needs a migration and a full re-index'
      );
    }
    if (!isEditable(key)) {
      return badRequest(`Unknown field "${key.slice(0, 64)}"`);
    }
    const result = VALIDATORS[key](value);
    if (!result.ok) return badRequest(result.error);
    Object.assign(patch, { [key]: result.value });
  }
  if (Object.keys(patch).length === 0) {
    return badRequest('No fields to update');
  }

  if (patch.num_ctx !== undefined || patch.num_predict !== undefined) {
    // Checked on effective values, so an env-pinned num_ctx still constrains a saved num_predict.
    const current = await refreshLocalAiConfig({ force: true });
    const next = resolveLocalAiConfig({ ...current, ...patch });
    if (next.numPredict >= next.numCtx) {
      return badRequest('num_predict must be less than num_ctx');
    }
  }

  let row: LocalAiConfigRow;
  try {
    row = await updateLocalAiConfig(patch);
  } catch (error) {
    console.error('[local-ai] failed to update local_ai_config', error);
    return NextResponse.json({ success: false, error: 'Failed to save local AI configuration' }, { status: 500 });
  }

  await logAudit({
    actorUserId: admin.user.id,
    actorName: admin.user.name,
    action: 'ai.local_config.update',
    entityType: 'local_ai_config',
    entityId: '1',
    details: { ...patch },
  });

  const data = payload(row);
  const warnings: string[] = [];
  for (const field of Object.keys(patch) as EditableField[]) {
    const key = FIELD_KEYS[field];
    if (data.sources[key] === 'env') {
      warnings.push(`${ENV_VARS[key]} is set in the environment and overrides this value`);
    }
  }

  if (patch.chat_model !== undefined) {
    // Advisory only: the model may be pulled after saving, or Ollama may be down for maintenance.
    const health = await preflight([patch.chat_model], data.effective);
    if (!health.reachable) {
      warnings.push(`Ollama is not reachable at ${health.baseUrl}, so ${patch.chat_model} could not be verified`);
    } else if (health.missingModels.length > 0) {
      warnings.push(`${patch.chat_model} is not installed in Ollama. Run: ollama pull ${patch.chat_model}`);
    }
  }

  return NextResponse.json({ success: true, data: { ...data, warnings } });
}
