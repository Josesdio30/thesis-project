import { queryAux } from '@/lib/aux-db';
import {
  upsertAcsLocalAssignment,
  getAcsLocalAssignmentByAssignmentId,
  archiveAcsLocalAssignment,
  incrementNullFallback,
  insertLocalTokenUsage,
} from '@/lib/ai-local/acs-local-repo';

jest.mock('@/lib/aux-db', () => ({ queryAux: jest.fn() }));
const mockQuery = queryAux as jest.MockedFunction<typeof queryAux>;
const sql = () => (mockQuery.mock.calls[0][0] as string).replace(/\s+/g, ' ').trim();

describe('upsertAcsLocalAssignment', () => {
  it('writes to acs_local_assignments with corpus_id in place of a vector store', async () => {
    mockQuery.mockResolvedValue([{ id: 'a1' }] as never);

    const row = await upsertAcsLocalAssignment({
      assignment_id: '101', course_id: 'MAT', corpus_id: 'corpus-1',
      rubric: [{ max_score: 100 }], created_by: '7', status: 'setup',
      rerun_grading: false, rerun_grading_at: null, archived_at: null,
    });

    // The baseline acs_assignments table must never be touched by this path.
    expect(sql()).toContain('INSERT INTO acs_local_assignments');
    expect(sql()).not.toContain('vector_store_id');
    expect(sql()).toContain('ON CONFLICT (assignment_id)');
    expect(mockQuery.mock.calls[0][1]).toEqual([
      '101', 'MAT', 'corpus-1', '[{"max_score":100}]', '7', 'setup', false, null, null,
    ]);
    expect(row).toEqual({ id: 'a1' });
  });

  it('marks a rerun with its timestamp', async () => {
    mockQuery.mockResolvedValue([{ id: 'a1' }] as never);
    await upsertAcsLocalAssignment({
      assignment_id: '101', course_id: 'MAT', corpus_id: 'c', rubric: [], created_by: '7',
      status: 'setup', rerun_grading: true, rerun_grading_at: '2026-08-22T00:00:00Z', archived_at: null,
    });
    expect(mockQuery.mock.calls[0][1]).toEqual(
      expect.arrayContaining([true, '2026-08-22T00:00:00Z'])
    );
  });
});

describe('getAcsLocalAssignmentByAssignmentId', () => {
  it('returns the row when present', async () => {
    mockQuery.mockResolvedValue([{ id: 'a1', corpus_id: 'c1' }] as never);
    await expect(getAcsLocalAssignmentByAssignmentId('101')).resolves.toEqual({
      id: 'a1', corpus_id: 'c1',
    });
    expect(sql()).toContain('FROM acs_local_assignments');
  });

  it('returns null when the assignment has no local setup', async () => {
    mockQuery.mockResolvedValue([] as never);
    await expect(getAcsLocalAssignmentByAssignmentId('999')).resolves.toBeNull();
  });
});


describe('archiveAcsLocalAssignment', () => {
  // Mirrors archiveAcsAssignment on the baseline table; the corpus itself is
  // kept, so only the assignment row changes state.
  it('marks the local row archived with its timestamp', async () => {
    mockQuery.mockResolvedValue([] as never);
    await archiveAcsLocalAssignment('101', '2026-10-16T00:00:00.000Z');
    expect(sql()).toContain('UPDATE acs_local_assignments');
    expect(sql()).toContain("status = 'archived'");
    expect(sql()).toContain('archived_at = $2');
    expect(sql()).toContain('updated_at = NOW()');
    expect(sql()).toContain('WHERE assignment_id = $1');
    expect(mockQuery.mock.calls[0][1]).toEqual(['101', '2026-10-16T00:00:00.000Z']);
  });
});

describe('null-fallback counter', () => {
  // The harness filters nulls out of its medians, so an uncounted fallback
  // makes a half-failed run look better than a complete one.
  it('increments in place', async () => {
    mockQuery.mockResolvedValue([] as never);
    await incrementNullFallback('job-1');
    expect(sql()).toContain('null_fallback_count = null_fallback_count + 1');
    expect(mockQuery.mock.calls[0][1]).toEqual(['job-1']);
  });
});

describe('token usage', () => {
  it('accepts an explicit job id on the usage row', async () => {
    mockQuery.mockResolvedValue([] as never);
    await insertLocalTokenUsage({
      job_id: 'job-1', assignment_id: '101', student_id: '59', tokens_used: 10,
      prompt_tokens: 8, completion_tokens: 2, latency_ms: 1, load_ms: 0,
      eval_tokens_per_sec: 5, retrieval_ms: 0, model: 'm',
    });
    expect((mockQuery.mock.calls[0][1] as unknown[])[0]).toBe('job-1');
  });

  it('records latency instead of cost, rounding the millisecond fields', async () => {
    mockQuery.mockResolvedValue([] as never);
    await insertLocalTokenUsage({
      job_id: undefined, assignment_id: '101', student_id: '59', tokens_used: 1020,
      prompt_tokens: 900, completion_tokens: 120, latency_ms: 11500.7, load_ms: 4.2,
      eval_tokens_per_sec: 22.9, retrieval_ms: 4.6, model: 'qwen2.5:14b',
    });
    // Cost is hardcoded to 0 in the SQL — local grading has no per-token price.
    expect(sql()).toContain('estimated_cost');
    expect(mockQuery.mock.calls[0][1]).toEqual([
      null, '101', '59', 1020, 900, 120, 11501, 4, 22.9, 5, 'qwen2.5:14b',
    ]);
  });
});
