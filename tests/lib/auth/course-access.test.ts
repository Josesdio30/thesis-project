import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import {
  canManageCourse,
  getSessionUser,
  isAdminRole,
  isStudentRole,
  isTeacherRole,
  requireCourseManager,
  requireSessionMember,
  teacherIdsForAssignment,
  teacherIdsForCourseCode,
  teacherIdsForSession,
  teacherIdsForSubmission,
} from '@/lib/auth/course-access';
import { PERSONAS, sessionFor } from '../../helpers/personas';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    class_courses: { findMany: jest.fn() },
    sessions: { findUnique: jest.fn() },
    enrollments: { findFirst: jest.fn() },
    assignments: { findUnique: jest.fn() },
    assignment_submissions: { findUnique: jest.fn() },
  },
}));

const mockSession = getServerSession as jest.Mock;
const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;

describe('role helpers', () => {
  test.each(['ADMIN', 'admin', ' Admin '])('isAdminRole(%j) is true', role => {
    expect(isAdminRole(role)).toBe(true);
  });

  test.each(['TEACHER', 'STUDENT', null, undefined])('isAdminRole(%p) is false', role => {
    expect(isAdminRole(role)).toBe(false);
  });

  test.each(['TEACHER', 'GURU', 'guru'])('R-ROLE-2: isTeacherRole(%j) is true (GURU alias)', role => {
    expect(isTeacherRole(role)).toBe(true);
  });

  test.each(['ADMIN', 'STUDENT', null])('isTeacherRole(%p) is false', role => {
    expect(isTeacherRole(role)).toBe(false);
  });
});

describe('getSessionUser', () => {
  test('returns the numeric id and normalized role', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.guruOwner));
    await expect(getSessionUser()).resolves.toEqual({ id: 201, role: 'GURU' });
  });

  test('no session → null', async () => {
    mockSession.mockResolvedValue(null);
    await expect(getSessionUser()).resolves.toBeNull();
  });

  test('a session without a user → null', async () => {
    mockSession.mockResolvedValue({ expires: '2099-01-01' });
    await expect(getSessionUser()).resolves.toBeNull();
  });

  test('a user without an id → null', async () => {
    mockSession.mockResolvedValue({ user: { role: 'ADMIN' } });
    await expect(getSessionUser()).resolves.toBeNull();
  });

  test('a non-numeric id → null', async () => {
    mockSession.mockResolvedValue({ user: { id: 'abc', role: 'ADMIN' } });
    await expect(getSessionUser()).resolves.toBeNull();
  });

  test('a session without a role gets an empty role', async () => {
    mockSession.mockResolvedValue({ user: { id: '5' } });
    await expect(getSessionUser()).resolves.toEqual({ id: 5, role: '' });
  });
});

describe('FR-CRS-5 / Q-07: canManageCourse', () => {
  test('an admin manages any course, even one without a teacher', () => {
    expect(canManageCourse({ id: 301, role: 'ADMIN' }, [])).toBe(true);
  });

  test('the assigned teacher manages the course', () => {
    expect(canManageCourse({ id: 201, role: 'TEACHER' }, [201])).toBe(true);
  });

  test('a teacher assigned to one of several offerings manages it', () => {
    expect(canManageCourse({ id: 202, role: 'TEACHER' }, [201, null, 202])).toBe(true);
  });

  test('another teacher does not', () => {
    expect(canManageCourse({ id: 202, role: 'TEACHER' }, [201])).toBe(false);
  });

  test('a student never manages a course, even if their id matches', () => {
    expect(canManageCourse({ id: 201, role: 'STUDENT' }, [201])).toBe(false);
  });
});

describe('FR-CRS-5 / Q-07: requireCourseManager', () => {
  const resolver = jest.fn(async () => [201]);

  test('no session → 401 and the resolver is not called', async () => {
    mockSession.mockResolvedValue(null);
    const result = await requireCourseManager(resolver);
    expect(!result.ok && result.response.status).toBe(401);
    expect(resolver).not.toHaveBeenCalled();
  });

  test('an admin passes without resolving ownership', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.admin));
    await expect(requireCourseManager(resolver)).resolves.toEqual({ ok: true, user: { id: 301, role: 'ADMIN' } });
    expect(resolver).not.toHaveBeenCalled();
  });

  test('a student → 403 without resolving ownership', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.student));
    const result = await requireCourseManager(resolver);
    expect(!result.ok && result.response.status).toBe(403);
    expect(resolver).not.toHaveBeenCalled();
  });

  test('the assigned teacher passes', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.teacherOwner));
    await expect(requireCourseManager(resolver)).resolves.toEqual({ ok: true, user: { id: 201, role: 'TEACHER' } });
  });

  test('another teacher → 403 with a readable error', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.teacherOther));
    const result = await requireCourseManager(resolver);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toEqual({
      success: false,
      error: 'Forbidden: only the course teacher or an admin may do this',
    });
  });
});

describe('teacher resolvers', () => {
  test('teacherIdsForCourseCode lists the teacher of every offering', async () => {
    db.class_courses.findMany.mockResolvedValue([{ teacher_id: 201 }, { teacher_id: null }]);
    await expect(teacherIdsForCourseCode('MAT001')).resolves.toEqual([201, null]);
    expect(db.class_courses.findMany).toHaveBeenCalledWith({
      where: { courses: { course_code: 'MAT001' } },
      select: { teacher_id: true },
    });
  });

  test('teacherIdsForSession reads the session’s class_course', async () => {
    db.sessions.findUnique.mockResolvedValue({ class_courses: { teacher_id: 201 } });
    await expect(teacherIdsForSession('700')).resolves.toEqual([201]);
    expect(db.sessions.findUnique.mock.calls[0][0].where).toEqual({ id: 700 });
  });

  test('teacherIdsForSession: missing session or class_course → []', async () => {
    db.sessions.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ class_courses: null });
    await expect(teacherIdsForSession(700)).resolves.toEqual([]);
    await expect(teacherIdsForSession(700)).resolves.toEqual([]);
  });

  test('teacherIdsForAssignment reads assignment → session → class_course', async () => {
    db.assignments.findUnique.mockResolvedValue({ sessions: { class_courses: { teacher_id: 201 } } });
    await expect(teacherIdsForAssignment('7000')).resolves.toEqual([201]);
  });

  test('teacherIdsForAssignment: missing chain → []', async () => {
    db.assignments.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ sessions: null });
    await expect(teacherIdsForAssignment(7000)).resolves.toEqual([]);
    await expect(teacherIdsForAssignment(7000)).resolves.toEqual([]);
  });

  test('teacherIdsForSubmission reads submission → assignment → session → class_course', async () => {
    db.assignment_submissions.findUnique.mockResolvedValue({
      assignments: { sessions: { class_courses: { teacher_id: 201 } } },
    });
    await expect(teacherIdsForSubmission('70000')).resolves.toEqual([201]);
  });

  test('teacherIdsForSubmission: missing chain → []', async () => {
    db.assignment_submissions.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ assignments: null });
    await expect(teacherIdsForSubmission(1)).resolves.toEqual([]);
    await expect(teacherIdsForSubmission(1)).resolves.toEqual([]);
  });

  test.each([
    ['session', teacherIdsForSession],
    ['assignment', teacherIdsForAssignment],
    ['submission', teacherIdsForSubmission],
  ])('a non-numeric %s id resolves to [] without querying', async (_name, resolve) => {
    await expect(resolve('abc')).resolves.toEqual([]);
    expect(db.sessions.findUnique).not.toHaveBeenCalled();
    expect(db.assignments.findUnique).not.toHaveBeenCalled();
    expect(db.assignment_submissions.findUnique).not.toHaveBeenCalled();
  });
});

describe('Q-09 / FR-ASG-5: requireSessionMember', () => {
  const SESSION = { class_course_id: 70, class_courses: { teacher_id: 201, courses: { course_code: 'MAT001' } } };

  test.each(['STUDENT', 'student'])('isStudentRole(%j) is true', role => {
    expect(isStudentRole(role)).toBe(true);
  });

  test('isStudentRole is false for other roles', () => {
    expect(isStudentRole('TEACHER')).toBe(false);
  });

  test('no session → 401 without querying', async () => {
    mockSession.mockResolvedValue(null);
    const result = await requireSessionMember(700);
    expect(!result.ok && result.response.status).toBe(401);
    expect(db.sessions.findUnique).not.toHaveBeenCalled();
  });

  test('a non-numeric session id → 404 without querying', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.admin));
    const result = await requireSessionMember('x');
    expect(!result.ok && result.response.status).toBe(404);
    expect(db.sessions.findUnique).not.toHaveBeenCalled();
  });

  test('a missing session → 404, even for an admin', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.admin));
    db.sessions.findUnique.mockResolvedValue(null);
    const result = await requireSessionMember(700);
    expect(!result.ok && result.response.status).toBe(404);
  });

  test('a session of another course code → 404', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.admin));
    db.sessions.findUnique.mockResolvedValue(SESSION);
    const result = await requireSessionMember('700', { courseCode: 'BIO001' });
    expect(!result.ok && result.response.status).toBe(404);
  });

  test('a session without a class_course fails a course-code check → 404', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.admin));
    db.sessions.findUnique.mockResolvedValue({ class_course_id: null, class_courses: null });
    const result = await requireSessionMember(700, { courseCode: 'MAT001' });
    expect(!result.ok && result.response.status).toBe(404);
  });

  test('an admin is a member of every session', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.admin));
    db.sessions.findUnique.mockResolvedValue(SESSION);
    await expect(requireSessionMember(700, { courseCode: 'MAT001' })).resolves.toEqual({
      ok: true,
      user: { id: 301, role: 'ADMIN' },
    });
  });

  test('the assigned teacher (GURU alias) is a member', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.guruOwner));
    db.sessions.findUnique.mockResolvedValue(SESSION);
    await expect(requireSessionMember(700)).resolves.toMatchObject({ ok: true });
  });

  test('another teacher → 403', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.teacherOther));
    db.sessions.findUnique.mockResolvedValue(SESSION);
    const result = await requireSessionMember(700);
    expect(!result.ok && result.response.status).toBe(403);
  });

  test('a teacher on a session without a class_course → 403', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.teacherOwner));
    db.sessions.findUnique.mockResolvedValue({ class_course_id: null, class_courses: null });
    const result = await requireSessionMember(700);
    expect(!result.ok && result.response.status).toBe(403);
  });

  test('an enrolled student is a member', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.student));
    db.sessions.findUnique.mockResolvedValue(SESSION);
    db.enrollments.findFirst.mockResolvedValue({ id: 1 });
    await expect(requireSessionMember(700)).resolves.toMatchObject({ ok: true });
    expect(db.enrollments.findFirst).toHaveBeenCalledWith({
      where: { student_id: 101, class_course_id: 70 },
      select: { id: true },
    });
  });

  test('a student not enrolled → 403', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.student));
    db.sessions.findUnique.mockResolvedValue(SESSION);
    db.enrollments.findFirst.mockResolvedValue(null);
    const result = await requireSessionMember(700);
    expect(!result.ok && result.response.status).toBe(403);
  });

  test('a student on a session without a class_course → 403 without querying enrollments', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.student));
    db.sessions.findUnique.mockResolvedValue({ class_course_id: null, class_courses: null });
    const result = await requireSessionMember(700);
    expect(!result.ok && result.response.status).toBe(403);
    expect(db.enrollments.findFirst).not.toHaveBeenCalled();
  });
});
