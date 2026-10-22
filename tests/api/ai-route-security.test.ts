import { getServerSession } from 'next-auth';
import {
  createGradingJob,
  getAcsAssignmentByAssignmentId,
  updateGradingJobStatus,
} from '@/lib/db2/acs-repo';
import { gradeStudentAnswer } from '@/lib/grading-service';
import { canUseFeature } from '@/lib/feature-access';
import { getOpenAI } from '@/lib/openai';
import { prisma } from '@/lib/prisma';
import { POST as runSingle } from '@/app/api/ai-grading/run-single/route';
import { POST as runAll } from '@/app/api/ai-grading/run-all/route';
import { POST as detectPlagiarism } from '@/app/api/plagiarism/detect/route';

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/db2/acs-repo', () => ({
  createGradingJob: jest.fn(),
  getAcsAssignmentByAssignmentId: jest.fn(),
  updateGradingJobStatus: jest.fn(),
  acsTables: jest.fn(() => ({ jobs: 'acs_grading_jobs', results: 'acs_grading_results' })),
}));

// AI_PROVIDER is unset in tests, so the route must take the OpenAI path and
// read acs_assignments — the guard that stops a default from silently flipping.
jest.mock('@/lib/ai-local/acs-local-repo', () => ({
  getAcsLocalAssignmentByAssignmentId: jest.fn(() => {
    throw new Error('local ACS config must not be read when AI_PROVIDER is unset');
  }),
}));

jest.mock('@/lib/grading-service', () => ({
  gradeStudentAnswer: jest.fn(),
}));

jest.mock('@/lib/feature-access', () => ({
  canUseFeature: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    assignments: { findUnique: jest.fn() },
    assignment_submissions: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/openai', () => ({
  getOpenAI: jest.fn(),
}));

jest.mock('@/lib/plagiarism/detection', () => ({
  initDetection: jest.fn(),
  processDetection: jest.fn(),
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockGetAcsAssignment = getAcsAssignmentByAssignmentId as jest.MockedFunction<
  typeof getAcsAssignmentByAssignmentId
>;
const mockCreateGradingJob = createGradingJob as jest.Mock;
const mockUpdateGradingJobStatus = updateGradingJobStatus as jest.Mock;
const mockGradeStudentAnswer = gradeStudentAnswer as jest.Mock;
const mockCanUseFeature = canUseFeature as jest.Mock;
const mockGetOpenAI = getOpenAI as jest.Mock;
const mockFindSubmissions = prisma.assignment_submissions.findMany as jest.Mock;

function session(role: string) {
  return {
    user: {
      id: '99',
      name: 'White-box User',
      email: 'whitebox@example.test',
      role,
    },
    expires: '2099-01-01T00:00:00.000Z',
  };
}

function malformedRequest(url: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
}

describe('AI thesis route security and request validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a student before run-single reads the ACS configuration', async () => {
    mockGetServerSession.mockResolvedValue(session('STUDENT'));

    const response = await runSingle(
      new Request('http://localhost/api/ai-grading/run-single', {
        method: 'POST',
        body: JSON.stringify({ assignmentId: '5' }),
      }) as never
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Forbidden: Teachers only',
    });
    expect(mockGetAcsAssignment).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON sent to run-single', async () => {
    mockGetServerSession.mockResolvedValue(session('TEACHER'));

    const response = await runSingle(
      malformedRequest('http://localhost/api/ai-grading/run-single') as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Invalid JSON body',
    });
    expect(mockGetAcsAssignment).not.toHaveBeenCalled();
  });

  it('rejects a student before run-all reads the ACS configuration', async () => {
    mockGetServerSession.mockResolvedValue(session('STUDENT'));

    const response = await runAll(
      new Request('http://localhost/api/ai-grading/run-all', {
        method: 'POST',
        body: JSON.stringify({ assignmentId: '5' }),
      }) as never
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Forbidden: Teachers only',
    });
    expect(mockGetAcsAssignment).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON sent to run-all', async () => {
    mockGetServerSession.mockResolvedValue(session('TEACHER'));

    const response = await runAll(
      malformedRequest('http://localhost/api/ai-grading/run-all') as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Invalid JSON body',
    });
    expect(mockGetAcsAssignment).not.toHaveBeenCalled();
  });

  it('completes the run-all background branch and deletes its disposable vector store', async () => {
    const deleteVectorStore = jest.fn().mockResolvedValue(undefined);
    mockGetServerSession.mockResolvedValue(session('TEACHER'));
    mockGetAcsAssignment.mockResolvedValue({
      assignment_id: '5',
      course_id: '2',
      rubric: [{ questionId: '25', max_score: 100 }],
      vector_store_id: 'vs-disposable-test',
    } as never);
    mockCanUseFeature.mockResolvedValue({ allowed: true });
    mockFindSubmissions.mockResolvedValue([
      {
        student_id: 59,
        assignment_answers: [{ question_id: 25, answer_text: 'Testing answer' }],
      },
    ]);
    mockCreateGradingJob.mockResolvedValue({ id: 'job-test-1' });
    mockGradeStudentAnswer.mockResolvedValue({ score: 80, max_score: 100 });
    mockUpdateGradingJobStatus.mockResolvedValue(undefined);
    mockGetOpenAI.mockResolvedValue({ vectorStores: { delete: deleteVectorStore } });

    const response = await runAll(
      new Request('http://localhost/api/ai-grading/run-all', {
        method: 'POST',
        body: JSON.stringify({ assignmentId: '5' }),
      }) as never
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      jobId: 'job-test-1',
    });
    expect(mockGradeStudentAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: '5',
        studentId: '59',
        questionId: '25',
        groundingRef: 'vs-disposable-test',
      })
    );
    expect(mockUpdateGradingJobStatus).toHaveBeenCalledWith(
      'job-test-1',
      'completed',
      expect.any(String),
      { jobs: 'acs_grading_jobs', results: 'acs_grading_results' }
    );
    expect(deleteVectorStore).toHaveBeenCalledWith('vs-disposable-test');
  });

  it('returns 400 for malformed JSON sent to plagiarism detection', async () => {
    mockGetServerSession.mockResolvedValue(session('TEACHER'));

    const response = await detectPlagiarism(
      malformedRequest('http://localhost/api/plagiarism/detect')
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid JSON body' });
  });
});
