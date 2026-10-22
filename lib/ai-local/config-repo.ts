import { queryAux } from '@/lib/aux-db';
import { getCachedLocalAiConfigRow, setCachedLocalAiConfigRow, type LocalAiConfigRow } from '@/lib/ai-local/config';

/**
 * Persistence for the `local_ai_config` singleton, and the cache that makes it
 * visible to the synchronous `resolveLocalAiConfig()`. Env still wins over the
 * row at resolution time; this module only decides which row is current.
 */

/** Editable columns. Doubles as the SQL whitelist: only these names are ever interpolated. */
const EDITABLE_COLUMNS = [
  'base_url',
  'chat_model',
  'embed_model',
  'embed_dims',
  'num_ctx',
  'num_predict',
  'keep_alive',
  'retrieval_top_k',
] as const;

export type LocalAiConfigColumn = (typeof EDITABLE_COLUMNS)[number];

/** Every column is NOT NULL in the DDL, so a patch can set values but never clear them. */
export type LocalAiConfigPatch = Partial<{ [K in LocalAiConfigColumn]: NonNullable<LocalAiConfigRow[K]> }>;

const SELECT_COLUMNS = [...EDITABLE_COLUMNS, 'updated_at'].join(', ');

/** A tradeoff between admin edits taking effect and a DB round trip per embed call. */
export const LOCAL_AI_CONFIG_TTL_MS = 30_000;

/**
 * pg waits forever for a connection by default. A grading run must not stall
 * on a config read, so a hung query is treated like a failed one.
 */
export const LOCAL_AI_CONFIG_REFRESH_TIMEOUT_MS = 5_000;

let loadedAt: number | null = null;
let inFlight: Promise<LocalAiConfigRow | null> | null = null;
// Bumped by every write, so a read that started before it cannot overwrite it.
let generation = 0;

export async function getLocalAiConfigRow(): Promise<LocalAiConfigRow | null> {
  const rows = await queryAux<LocalAiConfigRow & Record<string, unknown>>(
    `SELECT ${SELECT_COLUMNS} FROM local_ai_config WHERE id = 1`
  );
  return rows[0] ?? null;
}

export async function updateLocalAiConfig(patch: LocalAiConfigPatch): Promise<LocalAiConfigRow> {
  // Iterating the whitelist, not the patch, keeps caller-supplied keys out of the SQL.
  const columns = EDITABLE_COLUMNS.filter(column => patch[column] !== undefined);
  if (columns.length === 0) {
    throw new Error('no local AI config fields to update');
  }

  const assignments = columns.map((column, index) => `${column} = $${index + 1}`);
  const rows = await queryAux<LocalAiConfigRow & Record<string, unknown>>(
    `UPDATE local_ai_config SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = 1 ` +
      `RETURNING ${SELECT_COLUMNS}`,
    columns.map(column => patch[column])
  );
  const row = rows[0];
  if (!row) {
    throw new Error('local_ai_config row is missing; run db/ai-db/local/010_local_ai_config.sql');
  }

  generation++;
  setCachedLocalAiConfigRow(row);
  loadedAt = Date.now();
  return row;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`local_ai_config read timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function loadIntoCache(): Promise<LocalAiConfigRow | null> {
  const startedAt = generation;
  try {
    const row = await withTimeout(getLocalAiConfigRow(), LOCAL_AI_CONFIG_REFRESH_TIMEOUT_MS);
    if (generation === startedAt) setCachedLocalAiConfigRow(row);
  } catch (error) {
    // Grading must not break because the row is unreadable: keep the last good
    // row (or none, meaning env and defaults) and try again after the TTL.
    console.error('[local-ai] could not read local_ai_config; keeping the previous values', error);
  }
  loadedAt = Date.now();
  return getCachedLocalAiConfigRow();
}

/**
 * Warms the cache read by `resolveLocalAiConfig()`. Called at the top of each
 * async local entry point; cheap within the TTL, and concurrent callers share
 * one query. Never throws.
 */
export async function refreshLocalAiConfig({
  force = false,
}: { force?: boolean } = {}): Promise<LocalAiConfigRow | null> {
  if (inFlight) return inFlight;
  if (!force && loadedAt !== null && Date.now() - loadedAt < LOCAL_AI_CONFIG_TTL_MS) {
    return getCachedLocalAiConfigRow();
  }

  inFlight = loadIntoCache().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Test-only: forget the loaded row and every timestamp. */
export function resetLocalAiConfigCacheForTests(): void {
  loadedAt = null;
  inFlight = null;
  generation = 0;
  setCachedLocalAiConfigRow(null);
}
