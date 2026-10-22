import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { getOpenAI } from '@/lib/openai';
import {
  archiveAcsAssignment,
  getAcsAssignmentByAssignmentId,
  getUploadedFilesByAssignmentId,
  getUploadedFilesByResourceIds,
  insertUploadedFiles,
} from '@/lib/db2/acs-repo';
import { archiveAcsLocalAssignment, getAcsLocalAssignmentByAssignmentId } from '@/lib/ai-local/acs-local-repo';
import { checkLocalResources } from '@/lib/ai-local/rag/check';
import {
  addFileToAssignmentCorpus,
  CorpusNotConfiguredError,
  UnprocessableFileError,
} from '@/lib/ai-local/rag/ingest';
import { POST as cleanup } from '@/app/api/assignments/cleanup/route';
import { POST as checkFiles } from '@/app/api/assignments/check-files/route';
import { POST as uploadFiles } from '@/app/api/assignments/upload-files/route';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    app_user: { findUnique: jest.fn() },
    resources: { findMany: jest.fn() },
  },
}));
jest.mock('@/lib/openai', () => ({ getOpenAI: jest.fn() }));
jest.mock('@/lib/db2/acs-repo', () => ({
  archiveAcsAssignment: jest.fn(),
  getAcsAssignmentByAssignmentId: jest.fn(),
  getUploadedFilesByAssignmentId: jest.fn(),
  getUploadedFilesByResourceIds: jest.fn(),
  insertUploadedFiles: jest.fn(),
}));
jest.mock('@/lib/ai-local/acs-local-repo', () => ({
  archiveAcsLocalAssignment: jest.fn(),
  getAcsLocalAssignmentByAssignmentId: jest.fn(),
}));
jest.mock('@/lib/ai-local/rag/check', () => ({ checkLocalResources: jest.fn() }));
// The error classes stay real so the route's instanceof checks are exercised.
jest.mock('@/lib/ai-local/rag/ingest', () => ({
  ...jest.requireActual('@/lib/ai-local/rag/ingest'),
  addFileToAssignmentCorpus: jest.fn(),
}));

const mockSession = getServerSession as jest.Mock;
const mockFindUser = prisma.app_user.findUnique as jest.Mock;
const mockFindResources = prisma.resources.findMany as jest.Mock;
const mockGetOpenAI = getOpenAI as jest.Mock;
const mockGetAcs = getAcsAssignmentByAssignmentId as jest.Mock;
const mockGetLocal = getAcsLocalAssignmentByAssignmentId as jest.Mock;
const mockArchiveLocal = archiveAcsLocalAssignment as jest.Mock;
const mockAddFile = addFileToAssignmentCorpus as jest.Mock;

const ORIGINAL_PROVIDER = process.env.AI_PROVIDER;
const setProvider = (value: string | undefined) => {
  if (value === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = value;
};

const userWithRole = (name: string, isActive = true) => ({
  id: 99,
  app_user_role: [{ is_active: isActive, enumeration: { name } }],
});

const jsonRequest = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', body: JSON.stringify(body) }) as never;

const uploadRequest = (assignmentId = '101', name = 'notes.txt') => {
  const form = new FormData();
  form.append('file', new File(['hello world'], name, { type: 'text/plain' }));
  form.append('assignmentId', assignmentId);
  return new Request('http://localhost/api/assignments/upload-files', { method: 'POST', body: form }) as never;
};

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockSession.mockResolvedValue({ user: { id: '99' } });
  mockFindUser.mockResolvedValue(userWithRole('GURU'));
  mockGetOpenAI.mockImplementation(() => {
    throw new Error('getOpenAI must not be called on the local path');
  });
});

afterEach(() => setProvider(ORIGINAL_PROVIDER));

describe('POST /api/assignments/cleanup', () => {
  const call = () => cleanup(jsonRequest('http://localhost/api/assignments/cleanup', { assignmentId: '101' }));

  describe('local provider', () => {
    beforeEach(() => setProvider('local'));

    it('archives the local row, keeps the corpus, and never touches OpenAI', async () => {
      mockGetLocal.mockResolvedValue({ assignment_id: '101', corpus_id: 'corpus-1' });

      const response = await call();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        cleanupDetails: { provider: 'local', corpus: 'kept', assignmentStatusUpdate: 'success' },
      });
      expect(mockArchiveLocal).toHaveBeenCalledWith('101', expect.any(String));
      expect(archiveAcsAssignment).not.toHaveBeenCalled();
      expect(mockGetAcs).not.toHaveBeenCalled();
      expect(mockGetOpenAI).not.toHaveBeenCalled();
    });

    it('reports a failed status update without failing the request', async () => {
      mockGetLocal.mockResolvedValue({ assignment_id: '101' });
      mockArchiveLocal.mockRejectedValue(new Error('db down'));

      const response = await call();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        cleanupDetails: { assignmentStatusUpdate: 'failed' },
      });
    });

    it('returns 404 when the assignment has no local ACS row', async () => {
      mockGetLocal.mockResolvedValue(null);
      const response = await call();
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ success: false, error: 'ACS Assignment not found' });
      expect(mockArchiveLocal).not.toHaveBeenCalled();
    });
  });

  describe('openai provider', () => {
    beforeEach(() => setProvider('openai'));

    it('deletes the vector store and files, then archives the baseline row', async () => {
      const deleteStore = jest.fn().mockResolvedValue(undefined);
      const deleteFile = jest.fn().mockResolvedValue(undefined);
      mockGetOpenAI.mockResolvedValue({ vectorStores: { delete: deleteStore }, files: { delete: deleteFile } });
      mockGetAcs.mockResolvedValue({ vector_store_id: 'vs-1' });
      (getUploadedFilesByAssignmentId as jest.Mock).mockResolvedValue([{ file_id: 'file-1' }]);

      const response = await call();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        cleanupDetails: {
          vectorStore: 'success',
          files: [{ fileId: 'file-1', status: 'success' }],
          assignmentStatusUpdate: 'success',
        },
      });
      expect(deleteStore).toHaveBeenCalledWith('vs-1');
      expect(deleteFile).toHaveBeenCalledWith('file-1');
      expect(archiveAcsAssignment).toHaveBeenCalledWith('101', expect.any(String));
      expect(mockGetLocal).not.toHaveBeenCalled();
    });
  });

  describe('role check', () => {
    beforeEach(() => setProvider('local'));

    it('allows an active GURU', async () => {
      mockGetLocal.mockResolvedValue({ assignment_id: '101' });
      expect((await call()).status).toBe(200);
    });

    it('rejects a student with 403', async () => {
      mockFindUser.mockResolvedValue(userWithRole('STUDENT'));
      expect((await call()).status).toBe(403);
      expect(mockGetLocal).not.toHaveBeenCalled();
    });

    it('rejects an inactive teacher role with 403', async () => {
      mockFindUser.mockResolvedValue(userWithRole('TEACHER', false));
      expect((await call()).status).toBe(403);
    });
  });
});

describe('POST /api/assignments/check-files', () => {
  const call = () =>
    checkFiles(jsonRequest('http://localhost/api/assignments/check-files', { resourceIds: [1, 2, 3] }));

  beforeEach(() => {
    mockFindResources.mockResolvedValue([
      { id: 1, file_url: '/uploads/a.pdf', file_name: 'a.pdf' },
      { id: 2, file_url: '/uploads/b.pdf', file_name: 'b.pdf' },
      { id: 3, file_url: '/uploads/c.pdf', file_name: 'c.pdf' },
    ]);
  });

  it('uses the local corpus check and never calls OpenAI on the local path', async () => {
    setProvider('local');
    const base = { local_path: '', openai_file_id: null, openai_exists: false };
    (checkLocalResources as jest.Mock).mockResolvedValue([
      { ...base, resource_id: 1, filename: 'a.pdf', local_exists: true, status: 'ok' },
      { ...base, resource_id: 2, filename: 'b.pdf', local_exists: false, status: 'missing_local' },
      { ...base, resource_id: 3, filename: 'c.pdf', local_exists: true, status: 'new' },
    ]);

    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(checkLocalResources).toHaveBeenCalledWith([
      { id: 1, file_url: '/uploads/a.pdf', file_name: 'a.pdf' },
      { id: 2, file_url: '/uploads/b.pdf', file_name: 'b.pdf' },
      { id: 3, file_url: '/uploads/c.pdf', file_name: 'c.pdf' },
    ]);
    expect(body.success).toBe(true);
    expect(body.data.summary).toEqual({ ok: 1, missing_openai: 0, missing_local: 1, new: 1 });
    expect(body.data.can_proceed).toBe(true);
    expect(body.data.files).toHaveLength(3);
    expect(mockGetOpenAI).not.toHaveBeenCalled();
    expect(getUploadedFilesByResourceIds).not.toHaveBeenCalled();
  });

  it('cannot proceed locally when every file is missing', async () => {
    setProvider('local');
    (checkLocalResources as jest.Mock).mockResolvedValue([
      {
        resource_id: 1, filename: 'a.pdf', local_path: '', local_exists: false,
        openai_file_id: null, openai_exists: false, status: 'missing_local',
      },
    ]);
    const body = await (await call()).json();
    expect(body.data.can_proceed).toBe(false);
  });

  it('still checks OpenAI files on the openai path', async () => {
    setProvider('openai');
    const retrieve = jest.fn().mockResolvedValue({ id: 'file-1' });
    mockGetOpenAI.mockResolvedValue({ files: { retrieve } });
    (getUploadedFilesByResourceIds as jest.Mock).mockResolvedValue([{ resource_id: 1, file_id: 'file-1' }]);

    const body = await (await call()).json();

    expect(retrieve).toHaveBeenCalledWith('file-1');
    expect(checkLocalResources).not.toHaveBeenCalled();
    const byId = Object.fromEntries(
      (body.data.files as { resource_id: number; status: string }[]).map(f => [f.resource_id, f.status])
    );
    expect(byId).toEqual({ 1: 'ok', 2: 'new', 3: 'new' });
    expect(body.data.summary).toEqual({ ok: 1, missing_openai: 0, missing_local: 0, new: 2 });
  });
});

describe('POST /api/assignments/upload-files', () => {
  describe('local provider', () => {
    beforeEach(() => setProvider('local'));

    it('adds the file to the corpus and never calls OpenAI', async () => {
      mockGetLocal.mockResolvedValue({ assignment_id: '101', corpus_id: 'corpus-1' });
      mockAddFile.mockResolvedValue({ document_id: 'doc-7', file_name: 'notes.txt', reused: false });

      const response = await uploadFiles(uploadRequest());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: { file_id: 'doc-7', filename: 'notes.txt' },
      });
      const [args] = mockAddFile.mock.calls[0];
      expect(args).toMatchObject({ assignmentId: '101', fileName: 'notes.txt' });
      expect(Buffer.isBuffer(args.buffer)).toBe(true);
      expect(args.buffer.toString()).toBe('hello world');
      expect(mockGetOpenAI).not.toHaveBeenCalled();
      expect(mockGetAcs).not.toHaveBeenCalled();
      expect(insertUploadedFiles).not.toHaveBeenCalled();
    });

    it('returns 404 when the assignment has no local ACS row', async () => {
      mockGetLocal.mockResolvedValue(null);
      const response = await uploadFiles(uploadRequest());
      expect(response.status).toBe(404);
      expect(mockAddFile).not.toHaveBeenCalled();
    });

    it('returns 404 when the corpus is missing', async () => {
      mockGetLocal.mockResolvedValue({ assignment_id: '101' });
      mockAddFile.mockRejectedValue(new CorpusNotConfiguredError('101'));
      expect((await uploadFiles(uploadRequest())).status).toBe(404);
    });

    it('returns 400 with a safe message for an unprocessable file', async () => {
      mockGetLocal.mockResolvedValue({ assignment_id: '101' });
      mockAddFile.mockRejectedValue(
        new UnprocessableFileError('could not parse file', { cause: new Error('secret internal detail') })
      );

      const response = await uploadFiles(uploadRequest('101', 'image.png'));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(JSON.stringify(body)).not.toContain('secret internal detail');
      expect(JSON.stringify(body)).not.toContain('could not parse file');
    });

    it('returns 500 for an infrastructure failure', async () => {
      mockGetLocal.mockResolvedValue({ assignment_id: '101' });
      mockAddFile.mockRejectedValue(new Error('ollama down'));
      expect((await uploadFiles(uploadRequest())).status).toBe(500);
    });
  });

  describe('openai provider', () => {
    beforeEach(() => setProvider('openai'));

    it('uploads to OpenAI, attaches to the vector store and records the file', async () => {
      // Drain the stream before the route deletes its temp file; an unread
      // stream would otherwise open lazily after the unlink and crash.
      let uploaded = '';
      const createFile = jest.fn(async ({ file }: { file: AsyncIterable<Buffer> }) => {
        for await (const chunk of file) uploaded += chunk.toString();
        return { id: 'file-9' };
      });
      const attach = jest.fn().mockResolvedValue(undefined);
      mockGetOpenAI.mockResolvedValue({ files: { create: createFile }, vectorStores: { files: { create: attach } } });
      mockGetAcs.mockResolvedValue({ vector_store_id: 'vs-1' });

      const response = await uploadFiles(uploadRequest());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: { file_id: 'file-9', filename: 'notes.txt' },
      });
      expect(createFile).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'assistants' }));
      expect(uploaded).toBe('hello world');
      expect(attach).toHaveBeenCalledWith('vs-1', { file_id: 'file-9' });
      expect(insertUploadedFiles).toHaveBeenCalledWith([
        { assignment_id: '101', file_id: 'file-9', filename: 'notes.txt' },
      ]);
      expect(mockAddFile).not.toHaveBeenCalled();
    });
  });

  describe('role check', () => {
    beforeEach(() => setProvider('local'));

    it('allows an active GURU', async () => {
      mockGetLocal.mockResolvedValue({ assignment_id: '101' });
      mockAddFile.mockResolvedValue({ document_id: 'doc-7', file_name: 'notes.txt', reused: false });
      expect((await uploadFiles(uploadRequest())).status).toBe(200);
    });

    it('rejects a student with 403', async () => {
      mockFindUser.mockResolvedValue(userWithRole('STUDENT'));
      expect((await uploadFiles(uploadRequest())).status).toBe(403);
      expect(mockAddFile).not.toHaveBeenCalled();
    });
  });
});
