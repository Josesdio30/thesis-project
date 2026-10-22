import { existsSync, readFileSync } from 'node:fs';
import {
  addFileToAssignmentCorpus,
  CorpusNotConfiguredError,
  createLocalCorpus,
  ingestFileIntoCorpus,
  UnprocessableFileError,
} from '@/lib/ai-local/rag/ingest';
import { parseDocument } from '@/lib/ai-local/rag/parsers';
import { getAiProvider } from '@/lib/ai';
import * as repo from '@/lib/ai-local/rag/repo';
import { refreshLocalAiConfig } from '@/lib/ai-local/config-repo';
import { setCachedLocalAiConfigRow, type LocalAiConfigRow } from '@/lib/ai-local/config';

jest.mock('node:fs', () => ({ existsSync: jest.fn(), readFileSync: jest.fn() }));
jest.mock('@/lib/ai-local/rag/parsers', () => ({ parseDocument: jest.fn() }));
jest.mock('@/lib/ai', () => ({ getAiProvider: jest.fn() }));
jest.mock('@/lib/ai-local/rag/repo', () => ({
  replaceCorpus: jest.fn(),
  unlinkCorpusDocuments: jest.fn(),
  linkCorpusDocument: jest.fn(),
  findDocumentByChecksum: jest.fn(),
  insertDocument: jest.fn(),
  deleteDocumentChunks: jest.fn(),
  countDocumentChunks: jest.fn(),
  insertChunksWithEmbeddings: jest.fn(),
  getCorpusByAssignment: jest.fn(),
}));

// The DB-backed config cache is exercised in config-repo.test.ts; here it only
// has to stay out of the database.
jest.mock('@/lib/ai-local/config-repo', () => ({ refreshLocalAiConfig: jest.fn() }));
const mockRefresh = refreshLocalAiConfig as jest.MockedFunction<typeof refreshLocalAiConfig>;
afterEach(() => setCachedLocalAiConfigRow(null));
const warmWith = (row: LocalAiConfigRow) =>
  mockRefresh.mockImplementationOnce(async () => {
    setCachedLocalAiConfigRow(row);
    return row;
  });

const mockExists = existsSync as jest.MockedFunction<typeof existsSync>;
const mockRead = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockParse = parseDocument as jest.MockedFunction<typeof parseDocument>;
const mockEmbed = jest.fn();

const LONG = 'Materi pembelajaran tentang fotosintesis pada tumbuhan hijau di kelas dua belas. '.repeat(3);

const input = (resources = [{ id: 5, file_url: '/u/a.pdf', file_name: 'a.pdf' }]) => ({
  assignmentId: '101', courseId: 'MAT', createdBy: '7', resources,
});

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (getAiProvider as jest.Mock).mockReturnValue({ embeddings: { embed: mockEmbed } });
  (repo.replaceCorpus as jest.Mock).mockResolvedValue({ id: 'corpus-1' });
  (repo.countDocumentChunks as jest.Mock).mockResolvedValue(0);
  (repo.insertDocument as jest.Mock).mockResolvedValue({ id: 'doc-1' });
  (repo.findDocumentByChecksum as jest.Mock).mockResolvedValue(null);
  (repo.insertChunksWithEmbeddings as jest.Mock).mockResolvedValue(1);
  mockExists.mockReturnValue(true);
  mockRead.mockReturnValue(Buffer.from('file bytes'));
  mockParse.mockResolvedValue({ sections: [{ locator: 'p. 1', text: LONG }], charCount: LONG.length, lowText: false });
  mockEmbed.mockResolvedValue({ vectors: [Array(1024).fill(0.1)], totalTokens: 5, model: 'bge-m3', dims: 1024 });
});

describe('createLocalCorpus', () => {
  it('warms the DB config cache before resolving the embedding config', async () => {
    warmWith({ embed_model: 'db-embed', embed_dims: 768 });
    mockEmbed.mockResolvedValue({ vectors: [Array(768).fill(0.1)], totalTokens: 5, model: 'db-embed', dims: 768 });

    const result = await createLocalCorpus(input());

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(repo.replaceCorpus).toHaveBeenCalledWith(expect.objectContaining({ embed_model: 'db-embed', embed_dims: 768 }));
    // The width check uses the cached dims too, so a 768-wide row indexes cleanly.
    expect(result.files_failed).toBe(0);
  });

  it('parses, chunks, embeds and links a new document', async () => {
    const result = await createLocalCorpus(input());

    expect(repo.unlinkCorpusDocuments).toHaveBeenCalledWith('corpus-1');
    expect(repo.linkCorpusDocument).toHaveBeenCalledWith('corpus-1', 'doc-1');
    expect(result).toEqual({
      corpus_id: 'corpus-1', files_reused: 0, files_uploaded: 1, files_indexed: 1, files_failed: 0,
    });
  });

  it('carries the section locator onto every chunk', async () => {
    await createLocalCorpus(input());
    const [chunks] = (repo.insertChunksWithEmbeddings as jest.Mock).mock.calls[0];
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c: { locator: string }) => c.locator === 'p. 1')).toBe(true);
    expect(chunks.map((c: { chunk_index: number }) => c.chunk_index)).toEqual(
      chunks.map((_: unknown, i: number) => i)
    );
  });

  // Unchanged content with chunks already present needs no parse or embed call.
  it('reuses a cached document when the checksum matches', async () => {
    (repo.findDocumentByChecksum as jest.Mock).mockResolvedValue({
      id: 'doc-cached', file_name: 'a.pdf', low_text: false,
    });
    (repo.countDocumentChunks as jest.Mock).mockResolvedValue(12);

    const result = await createLocalCorpus(input());

    expect(mockParse).not.toHaveBeenCalled();
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(repo.linkCorpusDocument).toHaveBeenCalledWith('corpus-1', 'doc-cached');
    expect(result).toMatchObject({ files_reused: 1, files_uploaded: 0, files_indexed: 1 });
  });

  it('reuses one document for two resources holding identical content', async () => {
    (repo.findDocumentByChecksum as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'doc-1', file_name: 'same.txt', low_text: false });
    (repo.countDocumentChunks as jest.Mock).mockResolvedValue(4);

    const result = await createLocalCorpus(
      input([
        { id: 13, file_url: '/u/a.txt', file_name: 'a.txt' },
        { id: 14, file_url: '/u/a.txt', file_name: 'a.txt' },
      ])
    );

    // Parsed once, and the second resource resolves to the same document — so
    // the corpus cannot contain the same passage twice.
    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ files_indexed: 2, files_reused: 1 });
    expect((repo.linkCorpusDocument as jest.Mock).mock.calls.map(c => c[1])).toEqual(['doc-1', 'doc-1']);
  });

  it('re-parses a cached document whose chunks are gone', async () => {
    (repo.findDocumentByChecksum as jest.Mock).mockResolvedValue({ id: 'doc-cached', low_text: false });
    (repo.countDocumentChunks as jest.Mock).mockResolvedValue(0);
    await createLocalCorpus(input());
    expect(mockParse).toHaveBeenCalled();
  });

  it('propagates the low-text warning from a cached document', async () => {
    (repo.findDocumentByChecksum as jest.Mock).mockResolvedValue({
      id: 'doc-cached', file_name: 'scan.pdf', low_text: true,
    });
    (repo.countDocumentChunks as jest.Mock).mockResolvedValue(3);
    const result = await createLocalCorpus(input());
    expect(result.warning).toMatch(/very little text.*scan\.pdf/);
  });

  it('warns when a freshly parsed file yields little text', async () => {
    mockParse.mockResolvedValue({ sections: [{ locator: 'p. 1', text: LONG }], charCount: 10, lowText: true });
    const result = await createLocalCorpus(input());
    expect(result.warning).toMatch(/very little text/);
    expect(result.files_indexed).toBe(1);
  });

  it.each([
    ['a missing file', () => mockExists.mockReturnValue(false)],
    ['an unparseable file', () => mockParse.mockResolvedValue({ sections: [], charCount: 0, lowText: false })],
    ['a file whose chunks are all too short', () =>
      mockParse.mockResolvedValue({ sections: [{ locator: 'p. 1', text: 'tiny' }], charCount: 4, lowText: false })],
  ])('counts %s as a failure without aborting the run', async (_label, arrange) => {
    arrange();
    const result = await createLocalCorpus(input());
    expect(result).toMatchObject({ files_indexed: 0, files_failed: 1 });
    expect(result.warning).toMatch(/1 file\(s\) failed to index/);
  });

  it('fails the file when the embedding width does not match the configured one', async () => {
    mockEmbed.mockResolvedValue({ vectors: [[0.1]], totalTokens: 1, model: 'other', dims: 384 });
    const result = await createLocalCorpus(input());
    expect(result).toMatchObject({ files_indexed: 0, files_failed: 1 });
    expect(result.warning).toMatch(/failed to index/);
  });

  it('keeps going after one bad file among several', async () => {
    mockExists.mockReturnValueOnce(false).mockReturnValue(true);
    const result = await createLocalCorpus(
      input([
        { id: 1, file_url: '/u/bad.pdf', file_name: 'bad.pdf' },
        { id: 2, file_url: '/u/good.pdf', file_name: 'good.pdf' },
      ])
    );
    expect(result).toMatchObject({ files_indexed: 1, files_failed: 1, files_uploaded: 1 });
  });

  it('records a thrown non-Error value in the failure warning', async () => {
    mockParse.mockRejectedValue('parser blew up');
    const result = await createLocalCorpus(input());
    expect(result).toMatchObject({ files_indexed: 0, files_failed: 1 });
  });

  it('clears any chunks left by a crashed earlier run', async () => {
    await createLocalCorpus(input());
    expect(repo.deleteDocumentChunks).toHaveBeenCalledWith('doc-1');
  });
});

describe('ingestFileIntoCorpus', () => {
  const file = (over: Partial<Parameters<typeof ingestFileIntoCorpus>[0]> = {}) => ({
    corpusId: 'corpus-9', resourceId: null, fileName: 'notes.pdf', buffer: Buffer.from('bytes'), ...over,
  });

  // Adding one file must never rebuild the corpus it joins.
  it('indexes a new file into an existing corpus without rebuilding it', async () => {
    const result = await ingestFileIntoCorpus(file());

    expect(repo.replaceCorpus).not.toHaveBeenCalled();
    expect(repo.unlinkCorpusDocuments).not.toHaveBeenCalled();
    expect(repo.insertDocument).toHaveBeenCalledWith(expect.objectContaining({ resource_id: null, file_name: 'notes.pdf' }));
    expect(repo.linkCorpusDocument).toHaveBeenCalledWith('corpus-9', 'doc-1');
    expect(result).toEqual({ document_id: 'doc-1', file_name: 'notes.pdf', reused: false, low_text: false });
  });

  it('reuses a cached document and reports its stored name', async () => {
    (repo.findDocumentByChecksum as jest.Mock).mockResolvedValue({ id: 'doc-c', file_name: 'old.pdf', low_text: true });
    (repo.countDocumentChunks as jest.Mock).mockResolvedValue(2);

    const result = await ingestFileIntoCorpus(file());

    expect(mockParse).not.toHaveBeenCalled();
    expect(result).toEqual({ document_id: 'doc-c', file_name: 'old.pdf', reused: true, low_text: true });
  });

  it.each([
    ['a parser failure', () => mockParse.mockRejectedValue(new Error('bad zip'))],
    ['no extractable text', () => mockParse.mockResolvedValue({ sections: [], charCount: 0, lowText: false })],
    ['only too-short chunks', () =>
      mockParse.mockResolvedValue({ sections: [{ locator: 'p. 1', text: 'tiny' }], charCount: 4, lowText: false })],
  ])('rejects %s as an unprocessable file', async (_label, arrange) => {
    arrange();
    await expect(ingestFileIntoCorpus(file())).rejects.toBeInstanceOf(UnprocessableFileError);
    expect(repo.linkCorpusDocument).not.toHaveBeenCalled();
  });

  // An embedding mismatch is an operator problem, not the file's fault, so it
  // must not be reported to the teacher as a bad upload.
  it('does not classify an embedding failure as an unprocessable file', async () => {
    mockEmbed.mockResolvedValue({ vectors: [[0.1]], totalTokens: 1, model: 'other', dims: 384 });
    const error = await ingestFileIntoCorpus(file()).catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnprocessableFileError);
  });
});

describe('addFileToAssignmentCorpus', () => {
  // resolveIngestContext() runs as a default parameter, so the cache must be
  // warm before ingestFileIntoCorpus is even called.
  it('warms the DB config cache before resolving the ingest context', async () => {
    warmWith({ embed_dims: 768 });
    (repo.getCorpusByAssignment as jest.Mock).mockResolvedValue({ id: 'corpus-9' });
    mockEmbed.mockResolvedValue({ vectors: [Array(1024).fill(0.1)], totalTokens: 5, model: 'bge-m3', dims: 1024 });

    await expect(
      addFileToAssignmentCorpus({ assignmentId: '101', fileName: 'a.pdf', buffer: Buffer.from('x') })
    ).rejects.toThrow(/does not match the configured 768/);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('adds the file to the assignment corpus', async () => {
    (repo.getCorpusByAssignment as jest.Mock).mockResolvedValue({ id: 'corpus-9' });

    const result = await addFileToAssignmentCorpus({
      assignmentId: '101', fileName: 'extra.txt', buffer: Buffer.from('bytes'), resourceId: 42,
    });

    expect(repo.getCorpusByAssignment).toHaveBeenCalledWith('101');
    expect(repo.replaceCorpus).not.toHaveBeenCalled();
    expect(repo.unlinkCorpusDocuments).not.toHaveBeenCalled();
    expect(repo.insertDocument).toHaveBeenCalledWith(expect.objectContaining({ resource_id: 42 }));
    expect(repo.linkCorpusDocument).toHaveBeenCalledWith('corpus-9', 'doc-1');
    expect(result).toEqual({ document_id: 'doc-1', file_name: 'extra.txt', reused: false });
  });

  it('defaults the resource id to null for an ad-hoc upload', async () => {
    (repo.getCorpusByAssignment as jest.Mock).mockResolvedValue({ id: 'corpus-9' });
    await addFileToAssignmentCorpus({ assignmentId: '101', fileName: 'extra.txt', buffer: Buffer.from('b') });
    expect(repo.insertDocument).toHaveBeenCalledWith(expect.objectContaining({ resource_id: null }));
  });

  it('throws CorpusNotConfiguredError when the assignment has no corpus', async () => {
    (repo.getCorpusByAssignment as jest.Mock).mockResolvedValue(null);
    await expect(
      addFileToAssignmentCorpus({ assignmentId: '404', fileName: 'x.txt', buffer: Buffer.from('b') })
    ).rejects.toBeInstanceOf(CorpusNotConfiguredError);
    expect(mockParse).not.toHaveBeenCalled();
  });
});
