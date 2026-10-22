/**
 * Data access for the local Automated Grading tables (`acs_local_*`).
 *
 * A parallel schema rather than shared rows: the baseline `acs_*` tables hold
 * the frozen config-v1.4 grading evidence, and the two arms must be comparable
 * row for row without either overwriting the other.
 */
import { queryAux } from '@/lib/aux-db';
import type { Rubric } from '@/lib/types';

export interface AcsLocalAssignmentRecord {
  id: string;
  assignment_id: string;
  course_id: string;
  corpus_id: string | null;
  rubric: Rubric[];
  created_by: string;
  status: string;
}

export async function upsertAcsLocalAssignment(input: {
  assignment_id: string;
  course_id: string;
  corpus_id: string;
  rubric: unknown;
  created_by: string;
  status: string;
  rerun_grading: boolean;
  rerun_grading_at: string | null;
  archived_at: string | null;
}): Promise<AcsLocalAssignmentRecord> {
  const rows = await queryAux<AcsLocalAssignmentRecord>(
    `
      INSERT INTO acs_local_assignments (
        assignment_id, course_id, corpus_id, rubric, created_by,
        status, rerun_grading, rerun_grading_at, archived_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
      ON CONFLICT (assignment_id)
      DO UPDATE SET
        course_id = EXCLUDED.course_id,
        corpus_id = EXCLUDED.corpus_id,
        rubric = EXCLUDED.rubric,
        created_by = EXCLUDED.created_by,
        status = EXCLUDED.status,
        rerun_grading = EXCLUDED.rerun_grading,
        rerun_grading_at = EXCLUDED.rerun_grading_at,
        archived_at = EXCLUDED.archived_at,
        updated_at = NOW()
      RETURNING id, assignment_id, course_id, corpus_id, rubric, created_by, status
    `,
    [
      input.assignment_id,
      input.course_id,
      input.corpus_id,
      JSON.stringify(input.rubric),
      input.created_by,
      input.status,
      input.rerun_grading,
      input.rerun_grading_at,
      input.archived_at,
    ]
  );
  return rows[0];
}

export async function getAcsLocalAssignmentByAssignmentId(
  assignmentId: string
): Promise<AcsLocalAssignmentRecord | null> {
  const rows = await queryAux<AcsLocalAssignmentRecord>(
    `SELECT id, assignment_id, course_id, corpus_id, rubric, created_by, status
     FROM acs_local_assignments WHERE assignment_id = $1`,
    [assignmentId]
  );
  return rows[0] ?? null;
}

/** Mirrors `archiveAcsAssignment`. Only the row changes state: the corpus is
 *  durable and free to keep, so a re-grade can reuse it. */
export async function archiveAcsLocalAssignment(assignmentId: string, archivedAt: string): Promise<void> {
  await queryAux(
    `
      UPDATE acs_local_assignments
      SET
        status = 'archived',
        archived_at = $2,
        updated_at = NOW()
      WHERE assignment_id = $1
    `,
    [assignmentId, archivedAt]
  );
}


/**
 * Counts answers that fell back to a null score because the model's JSON did
 * not parse. The validation harness filters nulls out of its medians, so a
 * half-failed run would otherwise report a better-looking median over fewer
 * samples — the most dangerous failure mode in the whole local path.
 */
export async function incrementNullFallback(jobId: string): Promise<void> {
  await queryAux(
    `UPDATE acs_local_grading_jobs
     SET null_fallback_count = null_fallback_count + 1, updated_at = NOW()
     WHERE id = $1`,
    [jobId]
  );
}


/** Cost is always zero locally; latency and load time are the metrics that
 *  decide whether local grading is usable in a classroom. */
export async function insertLocalTokenUsage(input: {
  job_id?: string;
  assignment_id: string;
  student_id: string;
  tokens_used: number;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  load_ms: number;
  eval_tokens_per_sec: number;
  retrieval_ms: number;
  model: string;
}): Promise<void> {
  await queryAux(
    `INSERT INTO acs_local_token_usage (
       job_id, assignment_id, student_id, tokens_used, prompt_tokens, completion_tokens,
       estimated_cost, latency_ms, load_ms, eval_tokens_per_sec, retrieval_ms, model
     ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10, $11)`,
    [
      input.job_id ?? null, input.assignment_id, input.student_id, input.tokens_used,
      input.prompt_tokens, input.completion_tokens, Math.round(input.latency_ms),
      Math.round(input.load_ms), input.eval_tokens_per_sec, Math.round(input.retrieval_ms),
      input.model,
    ]
  );
}
