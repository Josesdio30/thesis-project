import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

/**
 * Course-level authorization (product decisions Q-07 / Q-10, 2026-10-17):
 * course content, publishing, grading, and AI/plagiarism data belong to the
 * teacher assigned to the class_course (`class_courses.teacher_id`) and to
 * admins. GURU is an alias of TEACHER (Q-02).
 */

export interface SessionUser {
  id: number;
  role: string;
}

export type CourseGuardResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

const TEACHER_ROLES = new Set(['TEACHER', 'GURU']);

function normalizeRole(role: string | null | undefined): string {
  return role?.trim().toUpperCase() ?? '';
}

export function isAdminRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'ADMIN';
}

export function isTeacherRole(role: string | null | undefined): boolean {
  return TEACHER_ROLES.has(normalizeRole(role));
}

export function isStudentRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'STUDENT';
}

/** The signed-in user, or null when there is no usable session. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const user = (await getServerSession(authOptions))?.user;
  if (!user?.id) return null;
  const id = parseInt(user.id, 10);
  if (Number.isNaN(id)) return null;
  return { id, role: normalizeRole(user.role) };
}

/** Admins manage every course; teachers only the class_courses they are assigned to. */
export function canManageCourse(user: SessionUser, teacherIds: Array<number | null>): boolean {
  if (isAdminRole(user.role)) return true;
  return isTeacherRole(user.role) && teacherIds.includes(user.id);
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}

export function notFoundResponse(): NextResponse {
  return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
}

export function forbiddenResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: 'Forbidden: only the course teacher or an admin may do this' },
    { status: 403 }
  );
}

/**
 * 401 without a session, 403 unless the user manages the course whose
 * teacher ids the resolver returns. A missing resource resolves to no
 * teacher, so only admins pass; others get 403 rather than a 404 that would
 * reveal whether the resource exists.
 */
export async function requireCourseManager(
  resolveTeacherIds: () => Promise<Array<number | null>>
): Promise<CourseGuardResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, response: unauthorizedResponse() };
  if (isAdminRole(user.role)) return { ok: true, user };
  if (!isTeacherRole(user.role)) return { ok: false, response: forbiddenResponse() };

  const teacherIds = await resolveTeacherIds();
  if (!canManageCourse(user, teacherIds)) return { ok: false, response: forbiddenResponse() };
  return { ok: true, user };
}

/**
 * Course membership (Q-09 / FR-ASG-5, 2026-10-17): the session's assigned
 * teacher, a student enrolled in its class_course, or an admin. 401 without a
 * session; 404 when the session does not exist or, if `courseCode` is given,
 * belongs to another course; 403 for everyone else.
 */
export async function requireSessionMember(
  sessionId: number | string,
  options: { courseCode?: string } = {}
): Promise<CourseGuardResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, response: unauthorizedResponse() };

  const id = validId(sessionId);
  if (id === null) return { ok: false, response: notFoundResponse() };
  const session = await prisma.sessions.findUnique({
    where: { id },
    select: {
      class_course_id: true,
      class_courses: { select: { teacher_id: true, courses: { select: { course_code: true } } } },
    },
  });
  const courseCode = session?.class_courses?.courses?.course_code;
  if (!session || (options.courseCode !== undefined && courseCode !== options.courseCode)) {
    return { ok: false, response: notFoundResponse() };
  }

  if (isAdminRole(user.role)) return { ok: true, user };
  if (isTeacherRole(user.role) && session.class_courses?.teacher_id === user.id) return { ok: true, user };
  if (isStudentRole(user.role) && session.class_course_id !== null) {
    const enrollment = await prisma.enrollments.findFirst({
      where: { student_id: user.id, class_course_id: session.class_course_id },
      select: { id: true },
    });
    if (enrollment) return { ok: true, user };
  }
  return { ok: false, response: forbiddenResponse() };
}

// ---- teacher resolvers: each returns the teacher ids of the owning class_course(s)

function validId(value: number | string): number | null {
  const id = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isNaN(id) ? null : id;
}

/** A course code can be offered to several classes, each with its own teacher. */
export async function teacherIdsForCourseCode(code: string): Promise<Array<number | null>> {
  const rows = await prisma.class_courses.findMany({
    where: { courses: { course_code: code } },
    select: { teacher_id: true },
  });
  return rows.map(row => row.teacher_id);
}

export async function teacherIdsForSession(sessionId: number | string): Promise<Array<number | null>> {
  const id = validId(sessionId);
  if (id === null) return [];
  const session = await prisma.sessions.findUnique({
    where: { id },
    select: { class_courses: { select: { teacher_id: true } } },
  });
  return session?.class_courses ? [session.class_courses.teacher_id] : [];
}

export async function teacherIdsForAssignment(assignmentId: number | string): Promise<Array<number | null>> {
  const id = validId(assignmentId);
  if (id === null) return [];
  const assignment = await prisma.assignments.findUnique({
    where: { id },
    select: { sessions: { select: { class_courses: { select: { teacher_id: true } } } } },
  });
  const classCourse = assignment?.sessions?.class_courses;
  return classCourse ? [classCourse.teacher_id] : [];
}

export async function teacherIdsForSubmission(submissionId: number | string): Promise<Array<number | null>> {
  const id = validId(submissionId);
  if (id === null) return [];
  const submission = await prisma.assignment_submissions.findUnique({
    where: { id },
    select: {
      assignments: { select: { sessions: { select: { class_courses: { select: { teacher_id: true } } } } } },
    },
  });
  const classCourse = submission?.assignments?.sessions?.class_courses;
  return classCourse ? [classCourse.teacher_id] : [];
}
