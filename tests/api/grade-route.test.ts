/**
 * CUJ-2 — teacher grades essay submissions (AI suggestion is reference only).
 * Route: /api/courses/{code}/sessions/{sessionId}/assignments/{assignmentId}/grade (GET, POST)
 *
 * Requirements: FR-GRD-1 (ungraded list), FR-GRD-2 (save points/feedback, GRADED),
 * FR-GRD-3 (graded_by = session, owner/admin only). Unconfirmed rules (FR-GRD-4 bounds Q-16,
 * FR-GRD-5 total Q-17) are characterization tests logged in docs/qa/defect-candidates.md.
 * Everything is mocked: no database, no network.
 */
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { SubmissionStatus } from '@/lib/enumeration-service';
import { PERSONAS, sessionFor } from '../helpers/personas';
import { buildRequest, routeContext } from '../helpers/request';
import { resetPrismaMock, type PrismaMock } from '../helpers/prisma-mock';
import * as gradeRoute from '@/app/api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/grade/route';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/prisma', () => {
  const { createPrismaMock } = jest.requireActual('../helpers/prisma-mock');
  const prisma = createPrismaMock();
  return { __esModule: true, prisma, default: prisma };
});
jest.mock('@/lib/enumeration-service', () => ({
  SubmissionStatus: { getGradedId: jest.fn() },
}));

const db = prisma as unknown as PrismaMock;
const URL_ = '/api/courses/MAT001/sessions/700/assignments/7000/grade';
const PARAMS = { code: 'MAT001', sessionId: '700', assignmentId: '7000' };
const OWNER_TEACHER = 201;

function signIn(persona: keyof typeof PERSONAS) {
  (getServerSession as jest.Mock).mockResolvedValue(sessionFor(PERSONAS[persona]));
}

const submissionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 70000,
  assignment_id: 7000,
  assignment_answers: [
    { id: 801, question_id: 1 },
    { id: 802, question_id: 2 },
  ],
  assignments: {
    assignment_questions: [
      { id: 1, points: 10 },
      { id: 2, points: 20 },
    ],
  },
  ...overrides,
});

function arrange(opts: { submission?: unknown; gradedId?: number | null } = {}) {
  // teacherIdsForAssignment: assignments.findUnique -> sessions.class_courses.teacher_id
  db.assignments.findUnique.mockResolvedValue({ sessions: { class_courses: { teacher_id: OWNER_TEACHER } } });
  db.assignment_submissions.findUnique.mockResolvedValue('submission' in opts ? opts.submission : submissionRow());
  db.assignment_answers.update.mockResolvedValue({});
  db.assignment_submissions.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 70000,
    ...data,
  }));
  (SubmissionStatus.getGradedId as jest.Mock).mockResolvedValue('gradedId' in opts ? opts.gradedId : 12);
}

const grade = (json: Record<string, unknown>, params = PARAMS) =>
  gradeRoute.POST(buildRequest(URL_, { method: 'POST', json }), routeContext(params));

const validBody = {
  submission_id: 70000,
  grades: [
    { question_id: 1, points_earned: 8, feedback: 'Clear argument' },
    { question_id: 2, points_earned: 15, feedback: 'Missing example' },
  ],
  feedback: 'Good work',
};

beforeEach(() => {
  resetPrismaMock(db);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  signIn('teacherOwner');
  arrange();
});

describe('FR-GRD-2: saving a grade', () => {
  test('FR-GRD-2: points and feedback are stored per answer, the submission becomes GRADED with a total', async () => {
    const res = await grade(validBody);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(db.assignment_answers.update).toHaveBeenCalledWith({
      where: { id: 801 },
      data: { points_earned: 8, feedback: 'Clear argument' },
    });
    expect(db.assignment_answers.update).toHaveBeenCalledWith({
      where: { id: 802 },
      data: { points_earned: 15, feedback: 'Missing example' },
    });
    expect(db.assignment_submissions.update).toHaveBeenCalledWith({
      where: { id: 70000 },
      data: expect.objectContaining({ total_score: 23, feedback: 'Good work', status_id: 12, graded_by: 201 }),
    });
    expect(json.data.totalScore).toBe(23);
    expect(json.data.maxPossibleScore).toBe(30);
    expect(json.data.percentage).toBeCloseTo(76.67, 2);
  });

  test('FR-GRD-2: graded_at is set to the moment of grading', async () => {
    const before = Date.now();
    await grade(validBody);
    const { data } = db.assignment_submissions.update.mock.calls[0][0];
    expect(data.graded_at).toBeInstanceOf(Date);
    expect(data.graded_at.getTime()).toBeGreaterThanOrEqual(before);
  });

  test('FR-GRD-2: zero points are saved as zero, not skipped', async () => {
    const res = await grade({ ...validBody, grades: [{ question_id: 1, points_earned: 0, feedback: '' }] });
    expect(res.status).toBe(200);
    expect(db.assignment_answers.update).toHaveBeenCalledWith({
      where: { id: 801 },
      data: { points_earned: 0, feedback: '' },
    });
    expect((await res.json()).data.totalScore).toBe(0);
  });

  test('FR-GRD-2: a grade for a question the submission has no answer for is ignored', async () => {
    await grade({ ...validBody, grades: [{ question_id: 99, points_earned: 5, feedback: 'x' }] });
    expect(db.assignment_answers.update).not.toHaveBeenCalled();
  });

  test('FR-GRD-2: an answer whose question no longer exists is ignored; a question without points adds 0 to the maximum', async () => {
    arrange({
      submission: submissionRow({
        assignment_answers: [
          { id: 801, question_id: 1 },
          { id: 803, question_id: 3 },
        ],
        assignments: { assignment_questions: [{ id: 1, points: null }] },
      }),
    });
    const res = await grade({
      ...validBody,
      grades: [
        { question_id: 1, points_earned: 4, feedback: '' },
        { question_id: 3, points_earned: 9, feedback: '' },
      ],
    });
    const json = await res.json();
    expect(db.assignment_answers.update).toHaveBeenCalledTimes(1);
    expect(json.data.totalScore).toBe(4);
    expect(json.data.maxPossibleScore).toBe(0);
  });

  test('FR-GRD-2: percentage is 0 (not NaN) when nothing gradeable matched', async () => {
    const res = await grade({ ...validBody, grades: [] });
    const json = await res.json();
    expect(json.data.percentage).toBe(0);
    expect(json.data.totalScore).toBe(0);
  });
});

describe('FR-GRD-3: who may grade, and as whom (Q-07, Q-12)', () => {
  test.each([['teacherOwner'], ['guruOwner'], ['admin']] as const)('FR-GRD-3: %s may grade', async persona => {
    signIn(persona);
    expect((await grade(validBody)).status).toBe(200);
  });

  test.each([['student'], ['teacherOther']] as const)('FR-GRD-3: %s => 403 and no write', async persona => {
    signIn(persona);
    expect((await grade(validBody)).status).toBe(403);
    expect(db.assignment_answers.update).not.toHaveBeenCalled();
    expect(db.assignment_submissions.update).not.toHaveBeenCalled();
  });

  test('FR-GRD-3: no session => 401', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    expect((await grade(validBody)).status).toBe(401);
  });

  test('FR-GRD-3: graded_by is the session user even when the body names another grader', async () => {
    await grade({ ...validBody, grader_id: 999 });
    expect(db.assignment_submissions.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ graded_by: 201 }) })
    );
  });

  test('FR-GRD-3: an admin is recorded as grader under their own id', async () => {
    signIn('admin');
    await grade(validBody);
    expect(db.assignment_submissions.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ graded_by: 301 }) })
    );
  });
});

describe('Validation and integrity', () => {
  test('non-numeric assignment id => 400', async () => {
    const res = await grade(validBody, { ...PARAMS, assignmentId: 'abc' });
    expect(res.status).toBe(400);
  });

  test.each([
    ['no submission_id', { grades: [] }],
    ['no grades', { submission_id: 70000 }],
    ['grades not an array', { submission_id: 70000, grades: 'x' }],
  ])('%s => 400', async (_name, body) => {
    const res = await grade(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required fields: submission_id, grades');
  });

  test('unknown submission => 404', async () => {
    arrange({ submission: null });
    expect((await grade(validBody)).status).toBe(404);
  });

  test('a submission from another assignment => 400 and no write (cross-assignment grading blocked)', async () => {
    arrange({ submission: submissionRow({ assignment_id: 8000 }) });
    const res = await grade(validBody);
    expect(res.status).toBe(400);
    expect(db.assignment_submissions.update).not.toHaveBeenCalled();
  });

  test('GRADED status missing from the enumeration table => 500', async () => {
    arrange({ gradedId: null });
    const res = await grade(validBody);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to grade assignment');
    // NFR [A7]: internal error messages are logged, not returned.
    expect(json).not.toHaveProperty('details');
  });

  test('database failure during the transaction => 500, no success payload', async () => {
    db.assignment_answers.update.mockRejectedValue(new Error('deadlock'));
    const res = await grade(validBody);
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.success).toBeUndefined();
  });
});

describe('FR-GRD-1: GET ungraded submissions', () => {
  const essayAnswer = (name: string) => ({
    assignment_questions: { enumeration: { name } },
  });

  test('FR-GRD-1: only submissions with an essay/file answer are returned', async () => {
    db.assignment_submissions.findMany.mockResolvedValue([
      { id: 1, assignment_answers: [essayAnswer('ESSAY')] },
      { id: 2, assignment_answers: [essayAnswer('MULTIPLE CHOICE')] },
      { id: 3, assignment_answers: [essayAnswer('MULTIPLE CHOICE'), essayAnswer('FILE_UPLOAD')] },
    ]);
    const res = await gradeRoute.GET(buildRequest(URL_), routeContext(PARAMS));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.map((s: { id: number }) => s.id)).toEqual([1, 3]);
    expect(json.message).toBe('Found 2 submissions requiring manual grading');
    expect(db.assignment_submissions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { assignment_id: 7000, graded_at: null } })
    );
  });

  const getSubmission = (submissionId: string) =>
    gradeRoute.GET(buildRequest(URL_, { query: { submission_id: submissionId } }), routeContext(PARAMS));

  test('FR-GRD-1: a specific submission is returned by submission_id', async () => {
    db.assignment_submissions.findUnique.mockResolvedValue({ id: 70000, assignment_id: 7000 });
    const res = await getSubmission('70000');
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(70000);
  });

  // A3 / Q-07, Q-10: owning the URL's assignment must not unlock another course's submission.
  test('Q-10 [A3]: a submission from another assignment => 404 and nothing is returned', async () => {
    db.assignment_submissions.findUnique.mockResolvedValue({
      id: 80000,
      assignment_id: 8000,
      assignment_answers: [{ assignment_questions: { assignment_question_options: [{ is_correct: true }] } }],
    });
    const res = await getSubmission('80000');
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.data).toBeUndefined();
    expect(json.error).toBe('Submission not found');
  });

  test('Q-10 [A3]: the submission is looked up by id together with its assignment', async () => {
    db.assignment_submissions.findUnique.mockResolvedValue({ id: 70000, assignment_id: 7000 });
    await getSubmission('70000');
    expect(db.assignment_submissions.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 70000 } })
    );
  });

  test('GET with a non-numeric assignment id => 400', async () => {
    const res = await gradeRoute.GET(buildRequest(URL_), routeContext({ ...PARAMS, assignmentId: 'abc' }));
    expect(res.status).toBe(400);
  });

  test('a non-numeric submission_id => 400 and no lookup', async () => {
    const res = await getSubmission('abc');
    expect(res.status).toBe(400);
    expect(db.assignment_submissions.findUnique).not.toHaveBeenCalled();
  });

  test('FR-GRD-1: unknown submission_id => 404', async () => {
    db.assignment_submissions.findUnique.mockResolvedValue(null);
    expect((await getSubmission('1')).status).toBe(404);
  });

  test.each([['student'], ['teacherOther']] as const)('FR-GRD-3: GET as %s => 403', async persona => {
    signIn(persona);
    const res = await gradeRoute.GET(buildRequest(URL_), routeContext(PARAMS));
    expect(res.status).toBe(403);
    expect(db.assignment_submissions.findMany).not.toHaveBeenCalled();
  });

  test('database failure => 500', async () => {
    db.assignment_submissions.findMany.mockRejectedValue(new Error('down'));
    const res = await gradeRoute.GET(buildRequest(URL_), routeContext(PARAMS));
    expect(res.status).toBe(500);
  });
});

describe('characterization: unconfirmed rules', () => {
  // RISK O-20 / Q-16: points are not bounded by the question's points or by zero.
  test('FR-GRD-4 [characterization, Q-16]: points above the question maximum are saved as given', async () => {
    const res = await grade({ ...validBody, grades: [{ question_id: 1, points_earned: 500, feedback: '' }] });
    expect(res.status).toBe(200);
    expect(db.assignment_answers.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ points_earned: 500 }) })
    );
    expect((await res.json()).data.totalScore).toBe(500);
  });

  test('FR-GRD-4 [characterization, Q-16]: negative points are saved as given', async () => {
    const res = await grade({ ...validBody, grades: [{ question_id: 1, points_earned: -5, feedback: '' }] });
    expect((await res.json()).data.totalScore).toBe(-5);
  });

  // RISK O-20 / Q-17: total_score is the sum of the rows in the request, not of all answers.
  test('FR-GRD-5 [characterization, Q-17]: total_score covers only the graded rows in the request', async () => {
    await grade({ ...validBody, grades: [{ question_id: 2, points_earned: 15, feedback: 'x' }] });
    expect(db.assignment_submissions.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ total_score: 15 }) })
    );
  });

  // RISK O-20: points_earned is not type-checked; a numeric string concatenates instead of adding.
  test('FR-GRD-4 [characterization, Q-16]: string points corrupt the total by concatenation', async () => {
    const res = await grade({
      ...validBody,
      grades: [
        { question_id: 1, points_earned: '8', feedback: '' },
        { question_id: 2, points_earned: '15', feedback: '' },
      ],
    });
    expect((await res.json()).data.totalScore).toBe('0815');
  });

  // Q-18: regrading a GRADED submission is neither blocked nor versioned.
  test('FR-GRD-7 [characterization, Q-18]: an already graded submission can be graded again', async () => {
    arrange({ submission: submissionRow({ graded_at: new Date(), graded_by: 201 }) });
    expect((await grade(validBody)).status).toBe(200);
  });
});
