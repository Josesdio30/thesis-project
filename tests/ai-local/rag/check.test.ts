import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkLocalResources } from '@/lib/ai-local/rag/check';
import { sha256 } from '@/lib/ai-local/rag/checksum';
import { countDocumentChunks, findDocumentByChecksum } from '@/lib/ai-local/rag/repo';

jest.mock('node:fs', () => ({ existsSync: jest.fn() }));
jest.mock('node:fs/promises', () => ({ readFile: jest.fn() }));
jest.mock('@/lib/ai-local/rag/repo', () => ({
  findDocumentByChecksum: jest.fn(),
  countDocumentChunks: jest.fn(),
}));

const mockExists = existsSync as jest.MockedFunction<typeof existsSync>;
const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockFind = findDocumentByChecksum as jest.MockedFunction<typeof findDocumentByChecksum>;
const mockCount = countDocumentChunks as jest.MockedFunction<typeof countDocumentChunks>;

const resource = (id: number, name = `f${id}.pdf`) => ({ id, file_url: `/uploads/${name}`, file_name: name });
const doc = (id: string) => ({ id, resource_id: null, file_name: 'x', checksum: 'c', low_text: false, char_count: 1 });

beforeEach(() => {
  mockExists.mockReturnValue(true);
  mockReadFile.mockResolvedValue(Buffer.from('bytes') as never);
  mockFind.mockResolvedValue(null);
  mockCount.mockResolvedValue(0);
});

describe('checkLocalResources', () => {
  it('reports ok when identical content is already indexed with chunks', async () => {
    mockFind.mockResolvedValue(doc('d1'));
    mockCount.mockResolvedValue(7);

    const [result] = await checkLocalResources([resource(5)]);

    expect(mockReadFile).toHaveBeenCalledWith(path.join(process.cwd(), 'public', '/uploads/f5.pdf'));
    expect(mockFind).toHaveBeenCalledWith(sha256(Buffer.from('bytes')));
    expect(mockCount).toHaveBeenCalledWith('d1');
    expect(result).toEqual({
      resource_id: 5,
      filename: 'f5.pdf',
      local_path: '/uploads/f5.pdf',
      local_exists: true,
      openai_file_id: null,
      openai_exists: false,
      status: 'ok',
    });
  });

  it('reports new when the content has never been indexed', async () => {
    const [result] = await checkLocalResources([resource(5)]);
    expect(result).toMatchObject({ status: 'new', local_exists: true });
    expect(mockCount).not.toHaveBeenCalled();
  });

  // A document row whose chunks were cascaded away must be re-parsed, so it is
  // not ready to reuse.
  it('reports new when the cached document has no chunks', async () => {
    mockFind.mockResolvedValue(doc('d1'));
    mockCount.mockResolvedValue(0);
    const [result] = await checkLocalResources([resource(5)]);
    expect(result.status).toBe('new');
  });

  it('reports missing_local without reading when the file is not on disk', async () => {
    mockExists.mockReturnValue(false);
    const [result] = await checkLocalResources([resource(5)]);
    expect(result).toMatchObject({ status: 'missing_local', local_exists: false, openai_file_id: null });
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('never reports missing_openai and preserves input order', async () => {
    mockExists.mockImplementation(p => !String(p).endsWith('f2.pdf'));
    mockFind.mockImplementation(async () => doc('d'));
    mockCount.mockResolvedValue(3);

    const results = await checkLocalResources([resource(1), resource(2), resource(3)]);

    expect(results.map(r => [r.resource_id, r.status])).toEqual([
      [1, 'ok'],
      [2, 'missing_local'],
      [3, 'ok'],
    ]);
  });

  it('returns an empty list for no resources', async () => {
    await expect(checkLocalResources([])).resolves.toEqual([]);
  });
});
