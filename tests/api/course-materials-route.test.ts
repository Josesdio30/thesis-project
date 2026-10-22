import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/assignments/course-materials/route';
import { buildRequest } from '../helpers/request';
import { PERSONAS, sessionFor } from '../helpers/personas';
import { resetPrismaMock, type PrismaMock } from '../helpers/prisma-mock';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/prisma', () => {
  const { createPrismaMock } = jest.requireActual('../helpers/prisma-mock');
  const prisma = createPrismaMock();
  return { __esModule: true, prisma, default: prisma };
});

const db = prisma as unknown as PrismaMock;
const list = (assignmentId = '7001') => GET(buildRequest('/api/assignments/course-materials', {
  query: { assignmentId },
}));

beforeEach(() => {
  resetPrismaMock(db);
  (getServerSession as jest.Mock).mockResolvedValue(sessionFor(PERSONAS.teacherOwner));
  db.assignments.findUnique.mockResolvedValue({
    sessions: { class_course_id: 70, class_courses: { teacher_id: 201 } },
  });
  // Two offerings of the same course: the picker must never include offering 71.
  db.sessions.findMany.mockImplementation(async ({ where }) => [70, 71]
    .filter(id => id === where.class_course_id)
    .map(id => ({ id, title: 'Materials', session_number: 1, resources: [
      { id: id * 100, file_name: 'lesson.pdf', file_tittle: 'Lesson', file_type: 'pdf' },
      { id: id * 100 + 1, file_name: 'image.png', file_tittle: 'Image', file_type: 'png' },
    ] })));
});

test.each(['teacherOwner', 'guruOwner', 'admin'] as const)('%s sees supported materials only from the assignment offering', async persona => {
  (getServerSession as jest.Mock).mockResolvedValue(sessionFor(PERSONAS[persona]));
  const response = await list();
  expect(response.status).toBe(200);
  const { data } = await response.json();
  expect(data.flatMap((session: { resources: Array<{ id: number }> }) => session.resources.map(r => r.id))).toEqual([7000]);
});

test.each(['teacherOther', 'student'] as const)('%s cannot list assignment materials', async persona => {
  (getServerSession as jest.Mock).mockResolvedValue(sessionFor(PERSONAS[persona]));
  expect((await list()).status).toBe(403);
  expect(db.sessions.findMany).not.toHaveBeenCalled();
});

test('anonymous requests are rejected before database reads', async () => {
  (getServerSession as jest.Mock).mockResolvedValue(null);
  expect((await list()).status).toBe(401);
  expect(db.assignments.findUnique).not.toHaveBeenCalled();
});

test.each(['', 'invalid', '0', '-1', '7.5'])('invalid assignment ID %s is rejected', async id => {
  expect((await list(id)).status).toBe(400);
  expect(db.sessions.findMany).not.toHaveBeenCalled();
});

test('a missing assignment returns 404 without listing materials', async () => {
  db.assignments.findUnique.mockResolvedValue(null);
  expect((await list()).status).toBe(404);
  expect(db.sessions.findMany).not.toHaveBeenCalled();
});
