/**
 * CUJ-1 — student submits an assignment and gets the auto-score.
 * Route: POST /api/courses/{code}/sessions/{sessionId}/assignments/{assignmentId}/submit
 *
 * Requirements: FR-SUB-1 (publish/due/attempts), FR-SUB-2 (session identity, enrollment),
 * FR-SUB-4 (MC/TF all-or-nothing), FR-SUB-5 (essay => total_score null), FR-SUB-6 (attempt number).
 * Unconfirmed rules (Q-13 start date, Q-14 required answers) are characterization tests.
 * Everything is mocked: no database, no network.
 */
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { SubmissionStatus } from '@/lib/enumeration-service';
import { PERSONAS, sessionFor } from '../helpers/personas';
import { buildRequest, routeContext } from '../helpers/request';
import { resetPrismaMock, type PrismaMock } from '../helpers/prisma-mock';
import * as submitRoute from '@/app/api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/submit/route';
import * as assignmentRoute from '@/app/api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/route';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/prisma', () => {
  const { createPrismaMock } = jest.requireActual('../helpers/prisma-mock');
  const prisma = createPrismaMock();
  return { __esModule: true, prisma, default: prisma };
});
jest.mock('@/lib/enumeration-service', () => ({
  SubmissionStatus: { getSubmittedId: jest.fn() },
}));

const db = prisma as unknown as PrismaMock;
const URL_ = '/api/courses/MAT001/sessions/700/assignments/7000/submit';
const PARAMS = { code: 'MAT001', sessionId: '700', assignmentId: '7000' };

const MC = { id: 7, name: 'MULTIPLE CHOICE', category: 'QUESTION_TYPE', is_active: true };
const ESSAY = { id: 9, name: 'ESSAY', category: 'QUESTION_TYPE', is_active: true };

const mcQuestion = (id: number, points = 1) => ({
  id,
  question_type_id: 7,
  question_text: `Q${id}`,
  points,
  enumeration: MC,
  assignment_question_options: [
    { id: id * 10 + 1, option_text: 'right', is_correct: true },
    { id: id * 10 + 2, option_text: 'wrong', is_correct: false },
  ],
});
const essayQuestion = (id: number, points = 10) => ({
  id,
  question_type_id: 9,
  question_text: `E${id}`,
  points,
  enumeration: ESSAY,
  assignment_question_options: [],
});

const future = () => new Date(Date.now() + 86_400_000);
const past = () => new Date(Date.now() - 86_400_000);

function assignmentWith(questions: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    id: 7000,
    session_id: 700,
    is_published: true,
    due_date: future(),
    attempts_allowed: 1,
    assignment_questions: questions,
    ...overrides,
  };
}

function signIn(persona: keyof typeof PERSONAS = 'student') {
  (getServerSession as jest.Mock).mockResolvedValue(sessionFor(PERSONAS[persona]));
}

function arrange(opts: { assignment?: unknown; enrolled?: boolean; existing?: number } = {}) {
  db.assignments.findUnique.mockResolvedValue('assignment' in opts ? opts.assignment : assignmentWith([mcQuestion(1)]));
  db.enrollments.findFirst.mockResolvedValue(opts.enrolled === false ? null : { id: 1 });
  db.assignment_submissions.count.mockResolvedValue(opts.existing ?? 0);
  db.assignment_submissions.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 90000,
    ...data,
  }));
  db.assignment_submissions.update.mockResolvedValue({});
  let answerId = 500;
  db.assignment_answers.create.mockImplementation(async () => ({ id: ++answerId }));
  db.assignment_answers.update.mockResolvedValue({});
  (SubmissionStatus.getSubmittedId as jest.Mock).mockResolvedValue(10);
}

const submit = (answers: unknown = [{ question_id: 1, selected_option_id: 11 }], body?: Record<string, unknown>) =>
  submitRoute.POST(buildRequest(URL_, { method: 'POST', json: { answers, ...body } }), routeContext(PARAMS));

beforeEach(() => {
  resetPrismaMock(db);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  signIn();
  arrange();
});

describe('FR-SUB-4/6: happy path and auto-scoring', () => {
  test('FR-SUB-4: a question with no points counts as 1, missing options and is_correct are treated as none/false', async () => {
    const sparse = { ...mcQuestion(1), points: null, assignment_question_options: undefined };
    const unflagged = {
      ...mcQuestion(2),
      assignment_question_options: [{ id: 21, option_text: 'x', is_correct: null }],
    };
    arrange({ assignment: assignmentWith([sparse, unflagged]) });
    const res = await submit([
      { question_id: 1, selected_option_id: 11 },
      { question_id: 2, selected_option_id: 21 },
    ]);
    expect(res.status).toBe(200);
    expect((await res.json()).data.total_score).toBe(0);
  });

  test('FR-SUB-4: a correct MC answer earns the full question points, attempt 1, SUBMITTED', async () => {
    arrange({ assignment: assignmentWith([mcQuestion(1, 2), mcQuestion(2, 3)]) });
    const res = await submit([
      { question_id: 1, selected_option_id: 11 }, // correct
      { question_id: 2, selected_option_id: 22 }, // wrong
    ]);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.total_score).toBe(2);
    expect(json.data.attempt_number).toBe(1);
    expect(json.data.status_id).toBe(10);
    expect(json.data.needsManualGrading).toBe(false);
    expect(db.assignment_submissions.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { total_score: 2 } })
    );
    // per-answer points persisted, no partial credit on the wrong one
    expect(db.assignment_answers.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { points_earned: 2, feedback: 'Auto-graded' } })
    );
    expect(db.assignment_answers.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { points_earned: 0, feedback: 'Auto-graded' } })
    );
  });

  test('FR-SUB-4: an unanswered MC question scores 0 and the submission still succeeds', async () => {
    arrange({ assignment: assignmentWith([mcQuestion(1), mcQuestion(2)]) });
    const res = await submit([{ question_id: 1, selected_option_id: 11 }]);
    expect((await res.json()).data.total_score).toBe(1);
  });

  test('FR-SUB-5: with an essay question total_score stays null and the essay is flagged for manual grading', async () => {
    arrange({ assignment: assignmentWith([mcQuestion(1), essayQuestion(2)]) });
    const res = await submit([
      { question_id: 1, selected_option_id: 11 },
      { question_id: 2, answer_text: 'My essay' },
    ]);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.total_score).toBeNull();
    expect(json.data.needsManualGrading).toBe(true);
    expect(db.assignment_submissions.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { total_score: null } })
    );
    expect(db.assignment_answers.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { points_earned: 1, feedback: 'Auto-graded' } })
    );
    expect(db.assignment_answers.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { points_earned: 0, feedback: 'Requires manual grading' } })
    );
  });

  test('FR-SUB-6: attempt_number is the previous count + 1', async () => {
    arrange({ assignment: assignmentWith([mcQuestion(1)], { attempts_allowed: 3 }), existing: 2 });
    const res = await submit();
    expect((await res.json()).data.attempt_number).toBe(3);
  });

  test('answers for questions that are not part of the assignment are ignored, not stored', async () => {
    await submit([
      { question_id: 1, selected_option_id: 11 },
      { question_id: 999, selected_option_id: 1 },
    ]);
    expect(db.assignment_answers.create).toHaveBeenCalledTimes(1);
    expect(db.assignment_answers.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ question_id: 1 }) })
    );
  });
});

describe('FR-SUB-1: submission rules', () => {
  test('FR-SUB-1: unpublished assignment => 400 and nothing is written', async () => {
    arrange({ assignment: assignmentWith([mcQuestion(1)], { is_published: false }) });
    const res = await submit();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Assignment is not published');
    expect(db.assignment_submissions.create).not.toHaveBeenCalled();
  });

  test('FR-SUB-1: due date in the past => 400 and nothing is written', async () => {
    arrange({ assignment: assignmentWith([mcQuestion(1)], { due_date: past() }) });
    const res = await submit();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Assignment due date has passed');
    expect(db.assignment_submissions.create).not.toHaveBeenCalled();
  });

  test('FR-SUB-1: no due date means no deadline', async () => {
    arrange({ assignment: assignmentWith([mcQuestion(1)], { due_date: null }) });
    expect((await submit()).status).toBe(200);
  });

  test('FR-SUB-1: attempts exhausted => 400 "Maximum attempts reached"', async () => {
    arrange({ existing: 1 });
    const res = await submit();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Maximum attempts reached');
    expect(db.assignment_submissions.create).not.toHaveBeenCalled();
  });

  test('FR-SUB-1: attempts_allowed null falls back to 1 attempt', async () => {
    arrange({ assignment: assignmentWith([mcQuestion(1)], { attempts_allowed: null }), existing: 1 });
    expect((await submit()).status).toBe(400);
  });

  test('FR-SUB-1: one attempt below the limit still succeeds (boundary)', async () => {
    arrange({ assignment: assignmentWith([mcQuestion(1)], { attempts_allowed: 2 }), existing: 1 });
    expect((await submit()).status).toBe(200);
  });
});

describe('Input validation', () => {
  test('non-numeric assignment id => 400', async () => {
    const res = await submitRoute.POST(
      buildRequest(URL_, { method: 'POST', json: { answers: [] } }),
      routeContext({ ...PARAMS, assignmentId: 'abc' })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid assignment ID');
  });

  test('missing answers key => 400', async () => {
    const res = await submitRoute.POST(buildRequest(URL_, { method: 'POST', json: {} }), routeContext(PARAMS));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required field: answers');
  });

  test.each([['not-an-array'], [{ question_id: 1 }]])('answers=%p => 400', async answers => {
    const res = await submit(answers);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required field: answers');
  });

  test('unknown assignment => 404', async () => {
    arrange({ assignment: null });
    const res = await submit();
    expect(res.status).toBe(404);
  });

  test('malformed JSON body => 500 with no write (current behavior, see characterization)', async () => {
    const res = await submitRoute.POST(
      buildRequest(URL_, { method: 'POST', headers: { 'content-type': 'application/json' } }),
      routeContext(PARAMS)
    );
    expect(res.status).toBe(500);
    expect(db.assignment_submissions.create).not.toHaveBeenCalled();
  });
});

describe('FR-SUB-2: identity and enrollment (Q-12)', () => {
  test('FR-SUB-2: no session => 401', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    expect((await submit()).status).toBe(401);
    expect(db.assignment_submissions.create).not.toHaveBeenCalled();
  });

  test('FR-SUB-2: a body student_id is ignored; the session student is the submitter', async () => {
    await submit(undefined, { student_id: 102 });
    expect(db.assignment_submissions.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ student_id: 101 }) })
    );
    expect(db.assignment_submissions.count).toHaveBeenCalledWith({
      where: { assignment_id: 7000, student_id: 101 },
    });
  });

  test('FR-SUB-2: a student not enrolled in the course => 403 and nothing is written', async () => {
    arrange({ enrolled: false });
    const res = await submit();
    expect(res.status).toBe(403);
    expect(db.assignment_submissions.create).not.toHaveBeenCalled();
  });

  test('FR-SUB-2: enrollment is checked against the assignment\'s own session', async () => {
    await submit();
    expect(db.enrollments.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { student_id: 101, class_courses: { sessions: { some: { id: 700 } } } },
      })
    );
  });
});

describe('Integration failures', () => {
  test('SUBMITTED status missing from the enumeration table => 500 (transaction aborted)', async () => {
    (SubmissionStatus.getSubmittedId as jest.Mock).mockResolvedValue(null);
    const res = await submit();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to submit assignment');
    // NFR [A7]: internal error messages are logged, not returned.
    expect(json).not.toHaveProperty('details');
    expect(db.assignment_submissions.create).not.toHaveBeenCalled();
  });

  test('a database error mid-transaction => 500 and the success payload is never returned', async () => {
    db.assignment_answers.create.mockRejectedValue(new Error('connection lost'));
    const res = await submit();
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to submit assignment');
    expect(json.success).toBeUndefined();
  });
});

describe('characterization: unconfirmed rules (no decision yet)', () => {
  // RISK O-18 / Q-13: the start date is never checked. If the PO decides submissions
  // before start_date must be rejected, flip this to a requirement test.
  test('Q-13 [characterization]: a submission before start_date is accepted today', async () => {
    arrange({ assignment: assignmentWith([mcQuestion(1)], { start_date: future() }) });
    expect((await submit()).status).toBe(200);
  });

  // RISK O-19 / Q-14: required questions are not enforced.
  test('Q-14 [characterization]: an empty answers array is accepted today', async () => {
    const res = await submit([]);
    expect(res.status).toBe(200);
    expect((await res.json()).data.total_score).toBe(0);
  });

});

// A4 / O-18: the attempt count is read before the transaction, so two concurrent
// submits can both pass it. The unique index on (assignment_id, student_id,
// attempt_number) rejects the loser's insert; it must surface as 409, not 500.
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`assignment_id`,`student_id`,`attempt_number`)', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe.each([
  ['.../submit', () => submitRoute.POST],
  ['.../[assignmentId] (POST)', () => assignmentRoute.POST],
] as const)('FR-SUB-1 [A4]: concurrent double submit on %s', (_label, handler) => {
  const post = () =>
    handler()(
      buildRequest(URL_, { method: 'POST', json: { answers: [{ question_id: 1, selected_option_id: 11 }] } }),
      routeContext(PARAMS)
    );

  beforeEach(() => {
    // requireSessionMember (detail route) reads the session, then the enrollment.
    db.sessions.findUnique.mockResolvedValue({
      class_course_id: 70,
      class_courses: { teacher_id: 201, courses: { course_code: 'MAT001' } },
    });
  });

  test('FR-SUB-1: the losing insert (unique violation) => 409 and no answers are stored', async () => {
    db.assignment_submissions.create.mockRejectedValue(uniqueViolation());
    const res = await post();
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe('Maximum attempts reached');
    expect(json.success).toBeUndefined();
    expect(db.assignment_answers.create).not.toHaveBeenCalled();
  });

  test('FR-SUB-1: the next attempt number is the count + 1, so the unique index decides the race', async () => {
    arrange({ assignment: assignmentWith([mcQuestion(1)], { attempts_allowed: 2 }), existing: 1 });
    expect((await post()).status).toBe(200);
    expect(db.assignment_submissions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ assignment_id: 7000, student_id: 101, attempt_number: 2 }),
    });
  });

  test('any other database error is still a 500 without internal details', async () => {
    db.assignment_submissions.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', { code: 'P2003', clientVersion: 'test' })
    );
    const res = await post();
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json).not.toHaveProperty('details');
  });
});
