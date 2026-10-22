import { queryAux } from '@/lib/aux-db';
import {
  replaceCorpus, unlinkCorpusDocuments, linkCorpusDocument, findDocumentByChecksum,
  insertDocument, deleteDocumentChunks, countDocumentChunks, insertChunksWithEmbeddings,
  getCorpusByAssignment, searchCorpus,
} from '@/lib/ai-local/rag/repo';

jest.mock('@/lib/aux-db', () => ({ queryAux: jest.fn() }));
const mockQuery = queryAux as jest.MockedFunction<typeof queryAux>;

const sql = (call = 0) => (mockQuery.mock.calls[call][0] as string).replace(/\s+/g, ' ').trim();
const params = (call = 0) => mockQuery.mock.calls[call][1];

beforeEach(() => mockQuery.mockReset());

describe('replaceCorpus', () => {
  it('upserts on assignment_id and returns the row', async () => {
    mockQuery.mockResolvedValue([{ id: 'c1' }] as never);
    const row = await replaceCorpus({
      assignment_id: '101', course_id: 'MAT', embed_model: 'bge-m3',
      embed_dims: 1024, created_by: '7',
    });
    expect(sql()).toContain('ON CONFLICT (assignment_id)');
    expect(params()).toEqual(['101', 'MAT', 'bge-m3', 1024, '7']);
    expect(row).toEqual({ id: 'c1' });
  });
});

describe('corpus membership', () => {
  it('unlinks every document of a corpus', async () => {
    mockQuery.mockResolvedValue([] as never);
    await unlinkCorpusDocuments('c1');
    expect(sql()).toBe('DELETE FROM rag_corpus_documents WHERE corpus_id = $1');
    expect(params()).toEqual(['c1']);
  });

  it('links a document idempotently', async () => {
    mockQuery.mockResolvedValue([] as never);
    await linkCorpusDocument('c1', 'd1');
    expect(sql()).toContain('ON CONFLICT DO NOTHING');
    expect(params()).toEqual(['c1', 'd1']);
  });
});

describe('document cache', () => {
  // Identity is the content. Keying on the resource as well meant two LMS
  // resources holding the same file produced two documents, and an assignment
  // referencing both got every chunk twice.
  it('looks a document up by content checksum alone', async () => {
    mockQuery.mockResolvedValue([{ id: 'd1' }] as never);
    await expect(findDocumentByChecksum('abc')).resolves.toEqual({ id: 'd1' });
    expect(sql()).toContain('WHERE checksum = $1');
    expect(sql()).not.toContain('resource_id IS NOT DISTINCT FROM');
    expect(params()).toEqual(['abc']);
  });

  it('returns null when nothing matches', async () => {
    mockQuery.mockResolvedValue([] as never);
    await expect(findDocumentByChecksum('abc')).resolves.toBeNull();
  });

  it('inserts a document, updating the name on checksum conflict', async () => {
    mockQuery.mockResolvedValue([{ id: 'd1' }] as never);
    await insertDocument({
      resource_id: 5, file_name: 'a.pdf', checksum: 'abc', low_text: false, char_count: 120,
    });
    expect(sql()).toContain('ON CONFLICT (checksum)');
    expect(params()).toEqual([5, 'a.pdf', 'abc', false, 120]);
  });

  it('deletes and counts chunks for a document', async () => {
    mockQuery.mockResolvedValue([] as never);
    await deleteDocumentChunks('d1');
    expect(sql()).toBe('DELETE FROM rag_chunks WHERE document_id = $1');

    mockQuery.mockReset();
    mockQuery.mockResolvedValue([{ n: '7' }] as never);
    await expect(countDocumentChunks('d1')).resolves.toBe(7);
  });
});

describe('insertChunksWithEmbeddings', () => {
  const chunk = (i: number) => ({
    document_id: 'd1', content: `c${i}`, chunk_index: i, locator: `p. ${i}`, token_count: 10,
  });

  it('writes chunks then vectors, matched by insertion order', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 'id-0' }, { id: 'id-1' }] as never)
      .mockResolvedValueOnce([] as never);

    const written = await insertChunksWithEmbeddings([chunk(0), chunk(1)], [[0.1], [0.2]], 'bge-m3');

    expect(written).toBe(2);
    expect(sql(0)).toContain('INSERT INTO rag_chunks');
    expect(sql(0)).toContain('RETURNING id');
    // Positional pairing, not a per-row .find() lookup.
    expect(params(1)).toEqual(['id-0', '[0.1]', 'bge-m3', 'id-1', '[0.2]', 'bge-m3']);
    expect(sql(1)).toContain('$2::vector');
  });

  it('is a no-op for an empty batch', async () => {
    await expect(insertChunksWithEmbeddings([], [], 'bge-m3')).resolves.toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a chunk/vector length mismatch', async () => {
    await expect(insertChunksWithEmbeddings([chunk(0)], [], 'bge-m3')).rejects.toThrow(
      '1 chunks vs 0 vectors'
    );
  });
});

describe('reads', () => {
  it('fetches a corpus by assignment, or null', async () => {
    mockQuery.mockResolvedValue([{ id: 'c1' }] as never);
    await expect(getCorpusByAssignment('101')).resolves.toEqual({ id: 'c1' });
    mockQuery.mockResolvedValue([] as never);
    await expect(getCorpusByAssignment('102')).resolves.toBeNull();
  });

  it('orders corpus search by cosine distance and scopes it to the corpus', async () => {
    mockQuery.mockResolvedValue([{ chunk_id: 'x' }] as never);
    await searchCorpus('c1', [0.1, 0.2], 6);
    expect(sql()).toContain('WHERE cd.corpus_id = $1');
    expect(sql()).toContain('ORDER BY e.vector <=> $2::vector ASC');
    expect(params()).toEqual(['c1', '[0.1,0.2]', 6]);
  });
});
