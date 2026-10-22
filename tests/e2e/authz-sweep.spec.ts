/**
 * QA Phase 5 — authorization sweep against the real app and disposable DB for handlers that had no test
 * (docs/qa/route-coverage-map.md): the /api/admin/* family (FR-ADM-1) and course-scoped reads.
 *
 * Open defects are pinned with Playwright's `test.fail()` (the decided requirement; Playwright reports it as
 * passing while the defect exists and as failing once fixed) next to a characterization test of today's
 * behavior, so a pin cannot pass for an unrelated reason.
 */
import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';
import { COURSE, type UserKey } from './support/env';
import { loginAndLand } from './support/auth';
import { query, resetSubmissions, seedEssaySubmission } from './support/db';

async function apiAs(browser: Browser, user: UserKey): Promise<APIRequestContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAndLand(page, user);
  return context.request;
}

// Admin endpoints backed only by the LMS database (the AI ones also need aux tables, so they are probed
// for denial only).
const ADMIN_LMS_GETS = ['/api/admin/users', '/api/admin/classes', '/api/admin/courses', '/api/admin/enrollments', '/api/admin/academic-years'];
const ADMIN_AI_GETS = ['/api/admin/ai-config', '/api/admin/access-control', '/api/admin/audit-logs', '/api/admin/credentials'];

test.describe('FR-ADM-1: /api/admin/* is admin-only', () => {
  for (const user of ['student', 'teacher'] as const) {
    test(`${user} is denied on every admin read and receives no rows`, async ({ browser }) => {
      const client = await apiAs(browser, user);
      for (const url of [...ADMIN_LMS_GETS, ...ADMIN_AI_GETS]) {
        const res = await client.get(url);
        // FR-ADM-1 [IMPL] says 403. Five routes answer 401 for a signed-in non-admin (DC-35, see below).
        expect([401, 403], url).toContain(res.status());
        expect(JSON.stringify(await res.json()), url).not.toMatch(/e2e_student|e2e_teacher|MAT001|X-1/);
      }
    });
  }

  test('an admin can read the LMS admin endpoints', async ({ browser }) => {
    const admin = await apiAs(browser, 'admin');
    for (const url of ADMIN_LMS_GETS) expect((await admin.get(url)).status(), url).toBe(200);
  });

  test('a student cannot enroll a student through the admin API (no row written)', async ({ browser }) => {
    const student = await apiAs(browser, 'student');
    const res = await student.post('/api/admin/enrollments', { data: { class_course_id: 70, student_id: 102 } });
    expect([401, 403]).toContain(res.status());
    expect(await query('select id from enrollments where student_id = 102')).toEqual([]);
  });

  test('a student cannot create a course through the admin API (no row written)', async ({ browser }) => {
    const student = await apiAs(browser, 'student');
    const res = await student.post('/api/admin/courses', { data: { course_code: 'HACK01', course_name: 'x' } });
    expect([401, 403]).toContain(res.status());
    expect(await query("select id from courses where course_code = 'HACK01'")).toEqual([]);
  });

  test.fail('[DC-35 requirement] a signed-in non-admin gets 403 (not 401) from /api/admin/classes', async ({ browser }) => {
    const student = await apiAs(browser, 'student');
    expect((await student.get('/api/admin/classes')).status()).toBe(403);
  });

  test('[DC-35 characterization] today /api/admin/classes answers 401 "Admin access required" to a signed-in student', async ({ browser }) => {
    const student = await apiAs(browser, 'student');
    const res = await student.get('/api/admin/classes');
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe('Admin access required');
  });
});

test.describe('DC-36 / FR-ASG-5, Q-07: GET /api/courses/{code}/assignments (used by /assignment and useAssignmentData)', () => {
  const URL = `/api/courses/${COURSE.code}/assignments`;
  type Row = { id: number; submissions?: Array<{ student: { id: number } }>; questions?: Array<{ options: Array<Record<string, unknown>> }> };
  const essayOf = async (res: Awaited<ReturnType<APIRequestContext['get']>>) => {
    const body = (await res.json()) as Row[] | { data?: Row[]; assignments?: Row[] };
    const rows: Row[] = Array.isArray(body) ? body : (body.data ?? body.assignments ?? []);
    return rows.find(a => a.id === COURSE.essayAssignmentId);
  };

  test.beforeEach(async () => {
    await resetSubmissions();
    await seedEssaySubmission(101);
  });

  test('the course teacher sees the submission (positive path)', async ({ browser }) => {
    const teacher = await apiAs(browser, 'teacher');
    const res = await teacher.get(URL);
    expect(res.status()).toBe(200);
    expect((await essayOf(res))?.submissions?.map(s => s.student.id)).toEqual([101]);
  });

  test('[DC-36 requirement] a student not enrolled in the course => 403', async ({ browser }) => {
    const outsider = await apiAs(browser, 'otherStudent');
    expect((await outsider.get(URL)).status()).toBe(403);
  });

  test('[DC-36 regression] an enrolled student sees only their own submission and no keys', async ({ browser }) => {
    await seedEssaySubmission(102);
    const student = await apiAs(browser, 'student');
    const res = await student.get(URL);
    expect(res.status()).toBe(200);
    const essay = await essayOf(res);
    expect(essay?.submissions?.map(s => s.student.id)).toEqual([101]);
    const options = essay?.questions?.flatMap(q => q.options) ?? [];
    expect(options.length).toBeGreaterThan(0);
    expect(options.every(o => !('is_correct' in o))).toBe(true);
  });

  test('[DC-36 requirement] a teacher of another class is denied', async ({ browser }) => {
    const other = await apiAs(browser, 'otherTeacher');
    const res = await other.get(URL);
    expect(res.status()).toBe(403);
    expect(await res.json()).not.toHaveProperty('data');
  });

  test('[DC-36 regression] the course teacher sees answer keys', async ({ browser }) => {
    const teacher = await apiAs(browser, 'teacher');
    const res = await teacher.get(URL);
    expect(res.status()).toBe(200);
    const options = (await essayOf(res))?.questions?.flatMap(q => q.options) ?? [];
    expect(options.length).toBeGreaterThan(0);
    expect(options.every(o => 'is_correct' in o)).toBe(true);
  });

  test('[DC-36 regression] sharing a course code does not grant access to another class offering', async ({ browser }) => {
    await query("insert into classes (id, class_name, grade_level, year_id) values (6, 'X-2', '10', 1)");
    try {
      await query("insert into class_courses (id, class_id, course_id, teacher_id, start_date, end_date) values (71, 6, 50, 202, '2026-07-01', '2027-06-30')");
      await query("insert into sessions (id, class_course_id, title, session_number, start_time, end_time) values (701, 71, 'Other class', 1, '2026-07-20 08:00', '2026-07-20 09:30')");
      await query("insert into assignments (id, session_id, assignment_type_id, title, total_points, created_by) values (7100, 701, 4, 'Other class quiz', 100, 202)");
      for (const user of ['student', 'teacher', 'otherTeacher', 'admin'] as const) {
        const client = await apiAs(browser, user);
        const res = await client.get(URL);
        expect(res.status(), user).toBe(200);
        const { data } = await res.json();
        const ids = data.map((row: Row) => row.id).sort();
        expect(ids, user).toEqual(user === 'admin' ? [7000, 7001, 7100] : user === 'otherTeacher' ? [7100] : [7000, 7001]);
      }
    } finally {
      await query('delete from classes where id = 6');
    }
  });
});

test.describe('A8: session detail is middleware-only (expected behavior undecided)', () => {
  test('[A8 characterization] a non-enrolled student reads session 700 with its materials list (200)', async ({ browser }) => {
    const outsider = await apiAs(browser, 'otherStudent');
    const res = await outsider.get(`/api/courses/${COURSE.code}/sessions/${COURSE.sessionId}`);
    expect(res.status()).toBe(200);
    expect(JSON.stringify(await res.json())).toContain('Pertemuan 1');
  });
});
