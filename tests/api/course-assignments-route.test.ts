import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/courses/[code]/assignments/route';
import { PERSONAS, sessionFor } from '../helpers/personas';
import { buildRequest, routeContext } from '../helpers/request';
import { resetPrismaMock, type PrismaMock } from '../helpers/prisma-mock';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/prisma', () => {
  const { createPrismaMock } = jest.requireActual('../helpers/prisma-mock');
  const prisma = createPrismaMock();
  return { __esModule: true, prisma, default: prisma };
});

const db = prisma as unknown as PrismaMock;
const list = () => GET(buildRequest('/api/courses/MAT001/assignments'), routeContext({ code: 'MAT001' }));
const submission = (studentId: number) => ({
  id: studentId + 1000, student_id: studentId, total_score: '8',
  app_user_assignment_submissions_student_idToapp_user: { id: studentId, nama_lengkap: `Student ${studentId}`, user_name: `student${studentId}` },
});
const offering = (id: number, teacherId: number, enrolled: boolean) => ({
  id, teacher_id: teacherId, enrollments: enrolled ? [{ id: 1 }] : [],
  sessions: [{ id: id * 10, title: 'S1', assignments: [{
    id: id * 100, title: `Assignment ${id}`, enumeration: { name: 'QUIZ' },
    assignment_questions: [{ id: 1, enumeration: { name: 'MULTIPLE CHOICE' },
      assignment_question_options: [{ id: 11, option_text: 'a', is_correct: true }],
    }],
    assignment_submissions: [submission(101), submission(102)],
  }] }],
});

beforeEach(() => {
  resetPrismaMock(db);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (getServerSession as jest.Mock).mockResolvedValue(sessionFor(PERSONAS.student));
  db.courses.findUnique.mockResolvedValue({ id: 50, class_courses: [offering(70, 201, true), offering(71, 202, false)] });
});

test('an enrolled student sees only their offering, their own work and no answer keys', async () => {
  const res = await list();
  expect(res.status).toBe(200);
  const { data } = await res.json();
  expect(data.map((a: { id: number }) => a.id)).toEqual([7000]);
  expect(data[0].submissions.map((s: { student: { id: number } }) => s.student.id)).toEqual([101]);
  expect(data[0].questions[0].options[0]).not.toHaveProperty('is_correct');
  expect(db.courses.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    include: expect.objectContaining({ class_courses: expect.objectContaining({
      where: { enrollments: { some: { student_id: 101 } } },
    }) }),
  }));
});

test.each(['teacherOwner', 'guruOwner'] as const)('%s sees keys and submissions only in their own offering', async persona => {
  (getServerSession as jest.Mock).mockResolvedValue(sessionFor(PERSONAS[persona]));
  const { data } = await (await list()).json();
  expect(data.map((a: { id: number }) => a.id)).toEqual([7000]);
  expect(data[0].questions[0].options[0].is_correct).toBe(true);
  expect(data[0].submissions.map((s: { student: { id: number } }) => s.student.id)).toEqual([101, 102]);
  expect(db.courses.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    include: expect.objectContaining({ class_courses: expect.objectContaining({ where: { teacher_id: 201 } }) }),
  }));
});

test.each(['otherStudent', 'teacherOther'] as const)('%s outside every offering gets 403 without assignment data', async persona => {
  (getServerSession as jest.Mock).mockResolvedValue(sessionFor(PERSONAS[persona]));
  db.courses.findUnique.mockResolvedValue({ id: 50, class_courses: [offering(70, 201, false)] });
  const res = await list();
  expect(res.status).toBe(403);
  expect(await res.json()).not.toHaveProperty('data');
});

test('an admin may read all offerings with keys', async () => {
  (getServerSession as jest.Mock).mockResolvedValue(sessionFor(PERSONAS.admin));
  const { data } = await (await list()).json();
  expect(data.map((a: { id: number }) => a.id)).toEqual([7000, 7100]);
  expect(data.every((a: { questions: Array<{ options: Array<{ is_correct: boolean }> }> }) => a.questions[0].options[0].is_correct)).toBe(true);
});

test('anonymous requests get 401 without querying courses', async () => {
  (getServerSession as jest.Mock).mockResolvedValue(null);
  expect((await list()).status).toBe(401);
  expect(db.courses.findUnique).not.toHaveBeenCalled();
});

test('unknown roles get 403 without querying courses', async () => {
  (getServerSession as jest.Mock).mockResolvedValue({ user: { id: '101', role: 'NOT_A_TEACHER' } });
  expect((await list()).status).toBe(403);
  expect(db.courses.findUnique).not.toHaveBeenCalled();
});
