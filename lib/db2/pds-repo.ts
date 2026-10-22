import { queryAux } from '@/lib/aux-db';
import type { ProviderName } from '@/lib/ai/types';

/**
 * Which set of physical tables a plagiarism query runs against.
 *
 * The local provider writes to a parallel `pds_local_*` schema rather than
 * sharing the baseline tables. This is a safety requirement, not tidiness:
 * `cleanupPreviousDetectionData` deletes chunk rows for the submissions about
 * to be re-scanned and embeddings cascade off them, so a local run over the
 * same submission IDs would erase the OpenAI baseline the published results
 * were computed from.
 */
export interface PdsTableSet {
  detections: string;
  chunks: string;
  embeddings: string;
  comparisons: string;
  flags: string;
  teacherActions: string;
  auditLogs: string;
}

export const PDS_TABLES_OPENAI: PdsTableSet = Object.freeze({
  detections: 'pds_detections',
  chunks: 'pds_chunks',
  embeddings: 'pds_embeddings',
  comparisons: 'pds_comparisons',
  flags: 'pds_flags',
  teacherActions: 'pds_teacher_actions',
  auditLogs: 'pds_audit_logs',
});

export const PDS_TABLES_LOCAL: PdsTableSet = Object.freeze({
  detections: 'pds_local_detections',
  chunks: 'pds_local_chunks',
  embeddings: 'pds_local_embeddings',
  comparisons: 'pds_local_comparisons',
  flags: 'pds_local_flags',
  teacherActions: 'pds_local_teacher_actions',
  auditLogs: 'pds_local_audit_logs',
});

/**
 * Table names are interpolated into SQL below, which is normally an injection
 * vector. It is safe here precisely because this function is the only source:
 * it returns one of two frozen constants and throws on anything else, so a
 * table name can never originate from request data.
 */
export function pdsTables(provider: ProviderName): PdsTableSet {
  if (provider === 'openai') return PDS_TABLES_OPENAI;
  if (provider === 'local') return PDS_TABLES_LOCAL;
  throw new Error(`pdsTables: unknown provider "${provider}"`);
}

interface DetectionInsert {
  assignment_id: string;
  status: string;
  created_by: string;
  scanned_question_ids: string[];
}

interface DetectionUpdate {
  status?: string;
  completed_at?: string | null;
  total_submissions?: number;
  processed_submissions?: number;
  error_message?: string | null;
}

interface ChunkInsert {
  submission_id: string;
  content: string;
  chunk_index: number;
  question_index: number;
  start_char: number;
  end_char: number;
  token_count: number;
}

interface EmbeddingInsert {
  chunk_id: string;
  vector: number[];
  model: string;
}

interface ComparisonInsert {
  id: string;
  source_submission_id: string;
  target_submission_id: string;
  semantic_score: number;
  lexical_score: number;
  combined_score: number;
  risk_level: string;
  matched_chunks: unknown;
  compared_at: string;
}

interface FlagInsert {
  comparison_id: string;
  submission_id: string;
  status: string;
  is_false_positive: boolean;
}

interface FlagUpdate {
  reviewed?: boolean;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  status?: string;
  is_false_positive?: boolean;
  teacher_notes?: string | null;
  action_taken?: string | null;
}

interface TeacherActionInsert {
  flag_id: string;
  teacher_id: string;
  action: string;
  notes?: string | null;
}

interface AuditLogInsert {
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata?: unknown;
}

function toVectorLiteral(vector: number[]) {
  const normalized = vector.map((value) => {
    if (!Number.isFinite(value)) {
      throw new Error('Embedding vector contains non-finite values');
    }

    return Number(value).toString();
  });

  return `[${normalized.join(',')}]`;
}

function buildBulkInsertValues<T>(
  rows: T[],
  columns: Array<keyof T>,
  valueMapper?: (column: keyof T, value: unknown) => { value: unknown; cast?: string }
) {
  const values: unknown[] = [];
  const placeholders = rows.map((row) => {
    const tuple = columns.map((column) => {
      const originalValue = row[column];
      const mapped = valueMapper ? valueMapper(column, originalValue) : { value: originalValue };
      values.push(mapped.value);
      const placeholder = `$${values.length}`;
      return mapped.cast ? `${placeholder}::${mapped.cast}` : placeholder;
    });

    return `(${tuple.join(', ')})`;
  });

  return { placeholders, values };
}

function buildUpdateClause<T extends object>(fields: T) {
  const entries = Object.entries(fields as Record<string, unknown>).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    throw new Error('No fields provided for update');
  }

  const values = entries.map(([, value]) => value);
  const assignments = entries.map(([key], index) => `${key} = $${index + 2}`);

  return { assignments, values };
}

export async function createDetection(input: DetectionInsert, tables: PdsTableSet = PDS_TABLES_OPENAI) {
  const rows = await queryAux<{ id: string }>(
    `
      INSERT INTO ${tables.detections} (
        assignment_id,
        status,
        created_by,
        scanned_question_ids
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [input.assignment_id, input.status, input.created_by, input.scanned_question_ids]
  );

  return rows[0];
}

export async function updateDetection(detectionId: string, fields: DetectionUpdate, tables: PdsTableSet = PDS_TABLES_OPENAI) {
  const { assignments, values } = buildUpdateClause(fields);

  await queryAux(
    `
      UPDATE ${tables.detections}
      SET ${assignments.join(', ')}
      WHERE id = $1
    `,
    [detectionId, ...values]
  );
}

export async function getDetectionStatus(detectionId: string, tables: PdsTableSet = PDS_TABLES_OPENAI) {
  const rows = await queryAux<{
    assignment_id: string;
    status: string;
    total_submissions: number;
    processed_submissions: number;
    completed_at: string | null;
    error_message: string | null;
  }>(
    `
      SELECT
        assignment_id,
        status,
        total_submissions,
        processed_submissions,
        completed_at,
        error_message
      FROM ${tables.detections}
      WHERE id = $1
      LIMIT 1
    `,
    [detectionId]
  );

  return rows[0] ?? null;
}

export async function insertChunksReturningIds(chunks: ChunkInsert[], tables: PdsTableSet = PDS_TABLES_OPENAI) {
  if (chunks.length === 0) {
    return [];
  }

  const columns: Array<keyof ChunkInsert> = [
    'submission_id',
    'content',
    'chunk_index',
    'question_index',
    'start_char',
    'end_char',
    'token_count',
  ];
  const { placeholders, values } = buildBulkInsertValues(chunks, columns);

  return queryAux<{ id: string; chunk_index: number }>(
    `
      INSERT INTO ${tables.chunks} (
        submission_id,
        content,
        chunk_index,
        question_index,
        start_char,
        end_char,
        token_count
      )
      VALUES ${placeholders.join(', ')}
      RETURNING id, chunk_index
    `,
    values
  );
}

export async function insertEmbedding(chunkId: string, vector: number[], model: string, tables: PdsTableSet = PDS_TABLES_OPENAI) {
  await queryAux(
    `
      INSERT INTO ${tables.embeddings} (
        chunk_id,
        vector,
        model
      )
      VALUES ($1, $2::vector, $3)
    `,
    [chunkId, toVectorLiteral(vector), model]
  );
}

export async function insertEmbeddings(rows: EmbeddingInsert[], tables: PdsTableSet = PDS_TABLES_OPENAI) {
  if (rows.length === 0) {
    return;
  }

  const columns: Array<keyof EmbeddingInsert> = ['chunk_id', 'vector', 'model'];
  const { placeholders, values } = buildBulkInsertValues(rows, columns, (column, value) => {
    if (column === 'vector') {
      return { value: toVectorLiteral(value as number[]), cast: 'vector' };
    }

    return { value };
  });

  await queryAux(
    `
      INSERT INTO ${tables.embeddings} (
        chunk_id,
        vector,
        model
      )
      VALUES ${placeholders.join(', ')}
    `,
    values
  );
}

export async function insertComparisons(rows: ComparisonInsert[], tables: PdsTableSet = PDS_TABLES_OPENAI) {
  if (rows.length === 0) {
    return;
  }

  const columns: Array<keyof ComparisonInsert> = [
    'id',
    'source_submission_id',
    'target_submission_id',
    'semantic_score',
    'lexical_score',
    'combined_score',
    'risk_level',
    'matched_chunks',
    'compared_at',
  ];
  const { placeholders, values } = buildBulkInsertValues(rows, columns, (column, value) => {
    if (column === 'matched_chunks') {
      return { value: JSON.stringify(value), cast: 'jsonb' };
    }

    return { value };
  });

  await queryAux(
    `
      INSERT INTO ${tables.comparisons} (
        id,
        source_submission_id,
        target_submission_id,
        semantic_score,
        lexical_score,
        combined_score,
        risk_level,
        matched_chunks,
        compared_at
      )
      VALUES ${placeholders.join(', ')}
    `,
    values
  );
}

export async function insertFlags(rows: FlagInsert[], tables: PdsTableSet = PDS_TABLES_OPENAI) {
  if (rows.length === 0) {
    return;
  }

  const columns: Array<keyof FlagInsert> = [
    'comparison_id',
    'submission_id',
    'status',
    'is_false_positive',
  ];
  const { placeholders, values } = buildBulkInsertValues(rows, columns);

  await queryAux(
    `
      INSERT INTO ${tables.flags} (
        comparison_id,
        submission_id,
        status,
        is_false_positive
      )
      VALUES ${placeholders.join(', ')}
      ON CONFLICT DO NOTHING
    `,
    values
  );
}

export async function getComparisonsBySubmissionIds(submissionIds: string[], tables: PdsTableSet = PDS_TABLES_OPENAI) {
  if (submissionIds.length === 0) {
    return [];
  }

  return queryAux<{
    source_submission_id: string;
    target_submission_id: string;
    risk_level: string;
    combined_score: number;
  }>(
    `
      SELECT
        source_submission_id,
        target_submission_id,
        risk_level,
        combined_score
      FROM ${tables.comparisons}
      WHERE source_submission_id = ANY($1::text[])
         OR target_submission_id = ANY($1::text[])
    `,
    [submissionIds]
  );
}

export async function getComparisonsBySubmissionId(submissionId: string, tables: PdsTableSet = PDS_TABLES_OPENAI) {
  return queryAux<{
    id: string;
    source_submission_id: string;
    target_submission_id: string;
    combined_score: number;
    risk_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    matched_chunks: unknown;
  }>(
    `
      SELECT
        id,
        source_submission_id,
        target_submission_id,
        combined_score,
        risk_level,
        matched_chunks
      FROM ${tables.comparisons}
      WHERE source_submission_id = $1
         OR target_submission_id = $1
      ORDER BY combined_score DESC
    `,
    [submissionId]
  );
}

export async function getComparisonById(comparisonId: string, tables: PdsTableSet = PDS_TABLES_OPENAI) {
  const rows = await queryAux<{
    id: string;
    source_submission_id: string;
    target_submission_id: string;
    semantic_score: number;
    lexical_score: number;
    combined_score: number;
    risk_level: string;
    matched_chunks: unknown;
  }>(
    `
      SELECT *
      FROM ${tables.comparisons}
      WHERE id = $1
      LIMIT 1
    `,
    [comparisonId]
  );

  return rows[0] ?? null;
}

export async function getFlagByComparisonAndSubmission(
  comparisonId: string,
  submissionId: string,
  tables: PdsTableSet = PDS_TABLES_OPENAI
) {
  const rows = await queryAux<{
    id: string;
    reviewed: boolean;
    is_false_positive: boolean;
    teacher_notes: string | null;
  }>(
    `
      SELECT *
      FROM ${tables.flags}
      WHERE comparison_id = $1
        AND submission_id = $2
      LIMIT 1
    `,
    [comparisonId, submissionId]
  );

  return rows[0] ?? null;
}

/** Resolve ownership from the stored flag, never from caller-supplied IDs. */
export async function getFlagById(flagId: string, tables: PdsTableSet = PDS_TABLES_OPENAI) {
  const rows = await queryAux<{ id: string; submission_id: string }>(
    `SELECT id, submission_id FROM ${tables.flags} WHERE id = $1 LIMIT 1`,
    [flagId]
  );
  return rows[0] ?? null;
}

export async function updateFlag(flagId: string, fields: FlagUpdate, tables: PdsTableSet = PDS_TABLES_OPENAI) {
  const { assignments, values } = buildUpdateClause(fields);
  const rows = await queryAux(
    `
      UPDATE ${tables.flags}
      SET ${assignments.join(', ')}
      WHERE id = $1
      RETURNING *
    `,
    [flagId, ...values]
  );

  return rows[0] ?? null;
}

export async function insertTeacherAction(input: TeacherActionInsert, tables: PdsTableSet = PDS_TABLES_OPENAI) {
  await queryAux(
    `
      INSERT INTO ${tables.teacherActions} (
        flag_id,
        teacher_id,
        action,
        notes
      )
      VALUES ($1, $2, $3, $4)
    `,
    [input.flag_id, input.teacher_id, input.action, input.notes ?? null]
  );
}

export async function insertAuditLog(input: AuditLogInsert, tables: PdsTableSet = PDS_TABLES_OPENAI) {
  await queryAux(
    `
      INSERT INTO ${tables.auditLogs} (
        user_id,
        action,
        entity_type,
        entity_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      input.user_id,
      input.action,
      input.entity_type,
      input.entity_id,
      JSON.stringify(input.metadata ?? {}),
    ]
  );
}

export async function cleanupPreviousDetectionData(submissionIds: string[], tables: PdsTableSet = PDS_TABLES_OPENAI) {
  if (submissionIds.length === 0) return;

  // Delete flags → comparisons → embeddings → chunks (respecting FK order)
  await queryAux(
    `
      DELETE FROM ${tables.flags}
      WHERE comparison_id IN (
        SELECT id FROM ${tables.comparisons}
        WHERE source_submission_id = ANY($1::text[])
           OR target_submission_id = ANY($1::text[])
      )
    `,
    [submissionIds]
  );

  await queryAux(
    `
      DELETE FROM ${tables.comparisons}
      WHERE source_submission_id = ANY($1::text[])
         OR target_submission_id = ANY($1::text[])
    `,
    [submissionIds]
  );

  await queryAux(
    `
      DELETE FROM ${tables.embeddings}
      WHERE chunk_id IN (
        SELECT id FROM ${tables.chunks}
        WHERE submission_id = ANY($1::text[])
      )
    `,
    [submissionIds]
  );

  await queryAux(
    `
      DELETE FROM ${tables.chunks}
      WHERE submission_id = ANY($1::text[])
    `,
    [submissionIds]
  );
}

export async function getLatestDetectionForAssignment(assignmentId: string, tables: PdsTableSet = PDS_TABLES_OPENAI) {
  const rows = await queryAux<{
    id: string;
    status: string;
    completed_at: string | null;
    scanned_question_ids: string[];
  }>(
    `
      SELECT id, status, completed_at, scanned_question_ids
      FROM ${tables.detections}
      WHERE assignment_id = $1
      ORDER BY started_at DESC
      LIMIT 1
    `,
    [assignmentId]
  );

  return rows[0] ?? null;
}

export interface SimilarChunkMatch {
  source_chunk_id: string;
  target_chunk_id: string;
  source_submission_id: string;
  target_submission_id: string;
  source_content: string;
  target_content: string;
  question_index: number;
  similarity: number;
}

export async function findSimilarChunksLateral(submissionIds: string[], limitK: number = 5, tables: PdsTableSet = PDS_TABLES_OPENAI) {
  if (submissionIds.length < 2) return [];

  const rows = await queryAux<SimilarChunkMatch>(
    `
      SELECT 
        src.id as source_chunk_id,
        tgt.id as target_chunk_id,
        src.submission_id as source_submission_id,
        tgt.submission_id as target_submission_id,
        src.content as source_content,
        tgt.content as target_content,
        src.question_index,
        tgt.similarity
      FROM ${tables.chunks} src
      JOIN ${tables.embeddings} src_e ON src.id = src_e.chunk_id
      CROSS JOIN LATERAL (
        SELECT 
          t.id, 
          t.submission_id,
          t.content,
          1 - (src_e.vector <=> t_e.vector) as similarity
        FROM ${tables.chunks} t
        JOIN ${tables.embeddings} t_e ON t.id = t_e.chunk_id
        WHERE t.submission_id != src.submission_id
          AND t.question_index = src.question_index
          AND t.submission_id = ANY($1::text[])
        ORDER BY src_e.vector <=> t_e.vector ASC
        LIMIT $2
      ) tgt
      WHERE src.submission_id = ANY($1::text[])
    `,
    [submissionIds, limitK]
  );
  
  return rows;
}
