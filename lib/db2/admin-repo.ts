import { queryAux } from '@/lib/aux-db';

export interface AiConfigRecord {
  id: number;
  model: string;
  temperature: number;
  max_tokens: number | null;
  system_prompt: string;
  updated_by: string | null;
  updated_at: string;
}

export interface ApiCredentialRecord {
  provider: string;
  encrypted_key: string;
  key_hint: string;
  updated_by: string | null;
  updated_at: string;
}

export type FeatureScope = 'teacher' | 'course';
export type FeatureName = 'ai_grading' | 'plagiarism';

export interface FeatureAccessRecord {
  id: string;
  scope_type: FeatureScope;
  scope_id: string;
  feature: FeatureName;
  enabled: boolean;
  updated_by: string | null;
  updated_at: string;
}

export interface AuditLogRecord {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

// --- AI config -------------------------------------------------------------

export async function getAiConfigRow(): Promise<AiConfigRecord | null> {
  const rows = await queryAux<AiConfigRecord>(
    `SELECT id, model, temperature::float8 AS temperature, max_tokens,
            system_prompt, updated_by, updated_at
     FROM ai_config WHERE id = 1`
  );
  return rows[0] ?? null;
}

export interface UpdateAiConfigInput {
  model: string;
  temperature: number;
  max_tokens: number | null;
  system_prompt: string;
  updated_by: string | null;
}

export async function updateAiConfig(input: UpdateAiConfigInput): Promise<AiConfigRecord> {
  const rows = await queryAux<AiConfigRecord>(
    `INSERT INTO ai_config (id, model, temperature, max_tokens, system_prompt, updated_by, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, NOW())
     ON CONFLICT (id) DO UPDATE SET
       model = EXCLUDED.model,
       temperature = EXCLUDED.temperature,
       max_tokens = EXCLUDED.max_tokens,
       system_prompt = EXCLUDED.system_prompt,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING id, model, temperature::float8 AS temperature, max_tokens,
               system_prompt, updated_by, updated_at`,
    [input.model, input.temperature, input.max_tokens, input.system_prompt, input.updated_by]
  );
  return rows[0];
}

// --- API credentials -------------------------------------------------------

export async function getCredential(provider: string): Promise<ApiCredentialRecord | null> {
  const rows = await queryAux<ApiCredentialRecord>(
    `SELECT provider, encrypted_key, key_hint, updated_by, updated_at
     FROM api_credential WHERE provider = $1`,
    [provider]
  );
  return rows[0] ?? null;
}

export async function upsertCredential(input: {
  provider: string;
  encrypted_key: string;
  key_hint: string;
  updated_by: string | null;
}): Promise<void> {
  await queryAux(
    `INSERT INTO api_credential (provider, encrypted_key, key_hint, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (provider) DO UPDATE SET
       encrypted_key = EXCLUDED.encrypted_key,
       key_hint = EXCLUDED.key_hint,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [input.provider, input.encrypted_key, input.key_hint, input.updated_by]
  );
}

export async function deleteCredential(provider: string): Promise<void> {
  await queryAux(`DELETE FROM api_credential WHERE provider = $1`, [provider]);
}

// --- Feature access --------------------------------------------------------

export async function listFeatureAccess(): Promise<FeatureAccessRecord[]> {
  return queryAux<FeatureAccessRecord>(
    `SELECT id, scope_type, scope_id, feature, enabled, updated_by, updated_at
     FROM feature_access ORDER BY scope_type, scope_id, feature`
  );
}

export async function setFeatureAccess(input: {
  scope_type: FeatureScope;
  scope_id: string;
  feature: FeatureName;
  enabled: boolean;
  updated_by: string | null;
}): Promise<void> {
  await queryAux(
    `INSERT INTO feature_access (scope_type, scope_id, feature, enabled, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (scope_type, scope_id, feature) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [input.scope_type, input.scope_id, input.feature, input.enabled, input.updated_by]
  );
}

export async function isScopeEnabled(
  scopeType: FeatureScope,
  scopeId: string,
  feature: FeatureName
): Promise<boolean> {
  const rows = await queryAux<{ enabled: boolean }>(
    `SELECT enabled FROM feature_access
     WHERE scope_type = $1 AND scope_id = $2 AND feature = $3`,
    [scopeType, scopeId, feature]
  );
  return rows[0]?.enabled ?? false;
}

// --- Audit log -------------------------------------------------------------

export async function insertAuditLog(input: {
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
}): Promise<void> {
  await queryAux(
    `INSERT INTO audit_log (actor_user_id, actor_name, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.actor_user_id,
      input.actor_name,
      input.action,
      input.entity_type,
      input.entity_id,
      JSON.stringify(input.details ?? {}),
    ]
  );
}

export interface AuditLogFilters {
  action?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export async function listAuditLogs(
  filters: AuditLogFilters
): Promise<{ rows: AuditLogRecord[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.action) {
    params.push(filters.action);
    conditions.push(`action = $${params.length}`);
  }
  if (filters.actorUserId) {
    params.push(filters.actorUserId);
    conditions.push(`actor_user_id = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`created_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`created_at <= $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRows = await queryAux<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_log ${where}`,
    params
  );
  const total = parseInt(countRows[0]?.count ?? '0', 10);

  const rows = await queryAux<AuditLogRecord>(
    `SELECT id, actor_user_id, actor_name, action, entity_type, entity_id, details, created_at
     FROM audit_log ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filters.limit, filters.offset]
  );

  return { rows, total };
}

/** Aggregate token usage per teacher from ai.grading.call audit events. */
export async function getTokenUsageByTeacher(): Promise<
  { teacher_id: string; teacher_name: string | null; calls: number; total_tokens: number }[]
> {
  return queryAux(
    `SELECT actor_user_id AS teacher_id,
            MAX(actor_name) AS teacher_name,
            COUNT(*)::int AS calls,
            COALESCE(SUM((details->>'tokens_used')::int), 0)::int AS total_tokens
     FROM audit_log
     WHERE action = 'ai.grading.call' AND actor_user_id IS NOT NULL
     GROUP BY actor_user_id
     ORDER BY total_tokens DESC`
  );
}
