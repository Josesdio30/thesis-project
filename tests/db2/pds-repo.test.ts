import { findSimilarChunksLateral } from '@/lib/db2/pds-repo';
import { queryAux } from '@/lib/aux-db';

// Project convention: DB integration is tested by verifying the SQL query generation and parameters.
jest.mock('@/lib/aux-db', () => ({
  queryAux: jest.fn(),
}));

describe('PDS Repo Integration: LATERAL Join Query Generation', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty array if fewer than 2 submission IDs are provided', async () => {
    const results = await findSimilarChunksLateral(['sub1']);
    expect(results).toEqual([]);
    expect(queryAux).not.toHaveBeenCalled();
  });

  it('should successfully construct and execute the LATERAL join query with correct parameters', async () => {
    const mockRows = [
      {
        source_chunk_id: 'chunk1',
        target_chunk_id: 'chunk2',
        source_submission_id: 'sub1',
        target_submission_id: 'sub2',
        source_content: 'hello',
        target_content: 'hello',
        question_index: 0,
        similarity: 0.95,
      }
    ];

    (queryAux as jest.Mock).mockResolvedValue(mockRows);

    const submissionIds = ['sub1', 'sub2'];
    const limitK = 3;

    const results = await findSimilarChunksLateral(submissionIds, limitK);

    expect(results).toEqual(mockRows);
    expect(queryAux).toHaveBeenCalledTimes(1);

    const callArgs = (queryAux as jest.Mock).mock.calls[0];
    const sql: string = callArgs[0];
    const params: unknown[] = callArgs[1];

    expect(sql).toContain('CROSS JOIN LATERAL');
    expect(sql).toContain('ORDER BY src_e.vector <=> t_e.vector ASC');
    expect(sql).toContain('1 - (src_e.vector <=> t_e.vector) as similarity');
    expect(sql).toContain('t.submission_id != src.submission_id');
    expect(sql).toContain('t.question_index = src.question_index');
    expect(sql).toContain('t.submission_id = ANY($1::text[])');
    expect(sql).toContain('LIMIT $2');

    expect(params).toEqual([submissionIds, limitK]);
  });
});
