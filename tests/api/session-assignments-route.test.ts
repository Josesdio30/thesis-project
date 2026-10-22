/**
 * Session assignment list and create.
 * Route: /api/courses/{code}/sessions/{sessionId}/assignments (GET, POST)
 *
 * Requirements: FR-ASG-5 (students see no answer keys and only their own work),
 * Q-07 (only the course teacher or an admin creates/publishes), Q-12 (created_by is
 * the session user, never the request body). Defects A1 and A2 in docs/qa/defect-candidates.md.
 * Everything is mocked: no database, no network.
 */
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { PERSONAS, sessionFor } from '../helpers/personas';
import { buildRequest, routeContext } from '../helpers/request';
import { resetPrismaMock, type PrismaMock } from '../helpers/prisma-mock';
import * as listRoute from '@/app/api/courses/[code]/sessions/[sessionId]/assignments/route';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/prisma', () => {
  const { createPrismaMock } = jest.requireActual('../helpers/prisma-mock');
  const prisma = createPrismaMock();
  return { __esModule: true, prisma, default: prisma };
});

const db = prisma as unknown as PrismaMock;
const URL_ = '/api/courses/MAT001/sessions/700/assignments';
const PARAMS = { code: 'MAT001', sessionId: '700' };
const NOW = new Date('2026-10-17T08:00:00.000Z');

function signIn(persona: keyof typeof PERSONAS) {
  (getServerSession as jest.Mock).mockResolvedValue(sessionFor(PERSONAS[persona]));
}

const submissionFor = (studentId: number, name: string) => ({
  id: 70000 + studentId,
  student_id: studentId,
  attempt_number: 1,
  submitted_at: NOW,
  total_score: '8',
  status_id: 11,
  app_user_assignment_submissions_student_idToapp_user: { id: studentId, nama_lengkap: `${name} user`, user_name: name },
});

const assignmentRow = () => ({
  id: 7000,
  title: 'Quiz 1',
  description: null,
  instructions: null,
  total_points: 100,
  due_date: NOW,
  start_date: NOW,
  time_limit: null,
  attempts_allowed: 1,
  show_results: true,
  is_published: true,
  assignment_type_id: 1,
  created_date: NOW,
  session_id: 700,
  enumeration: { name: 'QUIZ' },
  sessions: { id: 700, title: 'S1', description: null, session_number: 1 },
  assignment_questions: [
    {
      id: 1,
      question_text: 'Q1',
      points: 2,
      question_type_id: 1,
      order_number: 1,
      required: true,
      assignment_question_options: [
        { id: 11, option_text: 'a', is_correct: true, order_number: 1 },
        { id: 12, option_text: 'b', is_correct: false, order_number: 2 },
      ],
    },
  ],
  assignment_submissions: [submissionFor(101, 'student'), submissionFor(102, 'otherStudent')],
});

function arrange(opts: { enrolled?: boolean; courseCode?: string; session?: unknown } = {}) {
  // requireSessionMember and teacherIdsForSession both read sessions.findUnique.
  db.sessions.findUnique.mockResolvedValue(
    'session' in opts
      ? opts.session
      : {
          class_course_id: 70,
          class_courses: { teacher_id: 201, courses: { course_code: opts.courseCode ?? 'MAT001' } },
        }
  );
  db.enrollments.findFirst.mockResolvedValue(opts.enrolled === false ? null : { id: 1 });
  db.assignments.findMany.mockResolvedValue([assignmentRow()]);
  db.assignments.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 7001, ...data }));
  db.assignment_questions.create.mockImplementation(async () => ({ id: 1 }));
  db.assignment_question_options.create.mockResolvedValue({});
}

const list = (params = PARAMS) => listRoute.GET(buildRequest(URL_), routeContext(params));
const create = (json: Record<string, unknown>, params = PARAMS) =>
  listRoute.POST(buildRequest(URL_, { method: 'POST', json }), routeContext(params));

const validBody = {
  assignment_type_id: '1',
  title: 'Quiz 2',
  is_published: true,
  questions: [
    {
      question_type_id: '1',
      question_text: 'Q',
      points: '2',
      options: [{ option_text: 'a', is_correct: true }],
    },
  ],
};

beforeEach(() => {
  resetPrismaMock(db);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  signIn('teacherOwner');
  arrange();
});

describe('A1 / FR-ASG-5: GET the session assignment list', () => {
  test('FR-ASG-5: an enrolled student gets no answer keys and only their own submission', async () => {
    signIn('student');
    const res = await list();
    const json = await res.json();

    expect(res.status).toBe(200);
    for (const option of json.data[0].questions[0].options) expect(option).not.toHaveProperty('is_correct');
    expect(json.data[0].submissions.map((s: { student: { id: number } }) => s.student.id)).toEqual([101]);
  });

  test.each(['teacherOwner', 'guruOwner', 'admin'] as const)(
    'FR-ASG-5: %s sees answer keys and every submission',
    async persona => {
      signIn(persona);
      const json = await (await list()).json();
      expect(json.data[0].questions[0].options.map((o: { is_correct: boolean }) => o.is_correct)).toEqual([true, false]);
      expect(json.data[0].submissions.map((s: { student: { id: number } }) => s.student.id)).toEqual([101, 102]);
      expect(json.data[0].submissions[0].total_score).toBe(8);
    }
  );

  test('FR-ASG-5: a student not enrolled in the class => 403 and nothing is read', async () => {
    signIn('student');
    arrange({ enrolled: false });
    expect((await list()).status).toBe(403);
    expect(db.assignments.findMany).not.toHaveBeenCalled();
  });

  test('FR-ASG-5: a teacher of another class => 403', async () => {
    signIn('teacherOther');
    expect((await list()).status).toBe(403);
    expect(db.assignments.findMany).not.toHaveBeenCalled();
  });

  test('no session => 401', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    expect((await list()).status).toBe(401);
  });

  test('optional dates, session and scores come back empty instead of failing', async () => {
    db.assignments.findMany.mockResolvedValue([
      {
        ...assignmentRow(),
        due_date: null,
        start_date: null,
        created_date: null,
        sessions: null,
        assignment_submissions: [{ ...submissionFor(101, 'student'), submitted_at: null, total_score: null }],
      },
    ]);
    const [row] = (await (await list()).json()).data;
    expect(row).not.toHaveProperty('session_title');
    expect(row).not.toHaveProperty('session_number');
    expect(row).not.toHaveProperty('due_date');
    expect(row).not.toHaveProperty('start_date');
    expect(row).not.toHaveProperty('created_date');
    expect(row.submissions[0]).toMatchObject({ total_score: null });
    expect(row.submissions[0].submitted_at).toBeUndefined();
  });

  test('a session that belongs to another course code => 404', async () => {
    signIn('admin');
    arrange({ courseCode: 'BIO001' });
    expect((await list()).status).toBe(404);
  });

  test('non-numeric session id => 400', async () => {
    expect((await list({ ...PARAMS, sessionId: 'abc' })).status).toBe(400);
  });

  test('NFR [A7]: a database failure => 500 without internal error details', async () => {
    db.assignments.findMany.mockRejectedValue(new Error('relation "assignments" does not exist'));
    const res = await list();
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to fetch assignments');
    expect(json).not.toHaveProperty('details');
  });
});

describe('A2 / Q-07, Q-12: POST creates an assignment', () => {
  test.each([['teacherOwner', 201], ['guruOwner', 201], ['admin', 301]] as const)(
    'Q-07: %s may create, created_by is the session user',
    async (persona, id) => {
      signIn(persona);
      const res = await create(validBody);
      expect(res.status).toBe(200);
      expect(db.assignments.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ session_id: 700, title: 'Quiz 2', is_published: true, created_by: id }),
      });
      expect(db.assignment_question_options.create).toHaveBeenCalledTimes(1);
    }
  );

  test('Q-12: a created_by in the body is ignored', async () => {
    await create({ ...validBody, created_by: 999 });
    expect(db.assignments.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ created_by: 201 }),
    });
  });

  test('every optional field is stored when given', async () => {
    await create({
      ...validBody,
      description: 'd',
      instructions: 'i',
      total_points: '50',
      due_date: '2099-01-01T00:00:00.000Z',
      time_limit: '30',
      attempts_allowed: '3',
      show_results: true,
      questions: [{ question_type_id: '3', question_text: 'Essay', points: '10', order_number: 2, required: true }],
    });
    expect(db.assignments.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'd',
        instructions: 'i',
        total_points: 50,
        due_date: new Date('2099-01-01T00:00:00.000Z'),
        time_limit: 30,
        attempts_allowed: 3,
        show_results: true,
      }),
    });
    expect(db.assignment_questions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ points: 10, order_number: 2, required: true }),
    });
    // a question without options creates none
    expect(db.assignment_question_options.create).not.toHaveBeenCalled();
  });

  test('defaults: 100 points, 1 attempt, unpublished, no questions', async () => {
    await create({ assignment_type_id: '1', title: 'Bare', questions: 'not-an-array' });
    expect(db.assignments.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: null,
        instructions: null,
        total_points: 100,
        due_date: null,
        time_limit: null,
        attempts_allowed: 1,
        is_published: false,
      }),
    });
    expect(db.assignment_questions.create).not.toHaveBeenCalled();
  });

  test('question and option order default to 1, question points to 1', async () => {
    await create({
      ...validBody,
      questions: [{ question_type_id: '1', question_text: 'Q', options: [{ option_text: 'a' }] }],
    });
    expect(db.assignment_questions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ points: 1, order_number: 1, required: false }),
    });
    expect(db.assignment_question_options.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ is_correct: false, order_number: 1 }),
    });
  });

  test('Q-12: created_by is no longer a required body field', async () => {
    expect((await create(validBody)).status).toBe(200);
  });

  test.each(['student', 'teacherOther'] as const)('Q-07: %s => 403 and nothing is written', async persona => {
    signIn(persona);
    const res = await create({ ...validBody, created_by: 201 });
    expect(res.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.assignments.create).not.toHaveBeenCalled();
  });

  test('no session => 401 and nothing is written', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    expect((await create(validBody)).status).toBe(401);
    expect(db.assignments.create).not.toHaveBeenCalled();
  });

  test('Q-07: a non-admin cannot create in a session that does not exist => 403', async () => {
    arrange({ session: null });
    expect((await create(validBody)).status).toBe(403);
    expect(db.assignments.create).not.toHaveBeenCalled();
  });

  test.each([
    ['no title', { assignment_type_id: '1' }],
    ['no assignment_type_id', { title: 'x' }],
  ])('%s => 400', async (_label, body) => {
    const res = await create(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required fields: title, assignment_type_id');
  });

  test('non-numeric session id => 400', async () => {
    expect((await create(validBody, { ...PARAMS, sessionId: 'abc' })).status).toBe(400);
  });

  test('NFR [A7]: a database failure => 500 without internal error details', async () => {
    db.assignments.create.mockRejectedValue(new Error('violates foreign key constraint'));
    const json = await (await create(validBody)).json();
    expect(json.error).toBe('Failed to create assignment');
    expect(json).not.toHaveProperty('details');
  });
});
