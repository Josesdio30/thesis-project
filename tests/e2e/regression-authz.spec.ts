/**
 * QA Phase 4 — regression checks for the Phase 3 fixes (A1–A4, A6) against the real app and the
 * disposable database. The route tests in tests/api/** prove the logic with mocked Prisma; these prove the
 * wiring: real session cookies, real SQL, the real unique index, the real filesystem.
 *
 * Requirements: FR-ASG-5, Q-07, Q-12 (A1/A2), Q-10 (A3), FR-SUB-1 / O-18 (A4), Q-08 / Q-09 (A6, file privacy).
 * Oracles: HTTP status, response fields, and database rows. Never UI state alone.
 */
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';
import { COURSE, type UserKey } from './support/env';
import { loginAndLand } from './support/auth';
import { query, resetSubmissions, seedEssaySubmission, submissionsFor } from './support/db';

const LIST_URL = `/api/courses/${COURSE.code}/sessions/${COURSE.sessionId}/assignments`;
const submitUrl = (assignmentId: number) =>
  `/api/courses/${COURSE.code}/sessions/${COURSE.sessionId}/assignments/${assignmentId}/submit`;
const gradeUrl = (assignmentId: number) =>
  `/api/courses/${COURSE.code}/sessions/${COURSE.sessionId}/assignments/${assignmentId}/grade`;

type Assignment = {
  id: number;
  questions: Array<{ options: Array<Record<string, unknown>> }>;
  submissions: Array<{ student: { id: number } }>;
};

/** A signed-in API client for one seeded user (cookies from the real login form). */
async function apiAs(browser: Browser, user: UserKey): Promise<APIRequestContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAndLand(page, user);
  return context.request;
}

/** Assignments created by these tests get ids above the seeded 7000/7001. */
async function deleteCreatedAssignments(): Promise<void> {
  await query('delete from assignment_question_options where question_id in (select id from assignment_questions where assignment_id > 7001)');
  await query('delete from assignment_questions where assignment_id > 7001');
  await query('delete from assignments where id > 7001');
}

test.beforeEach(async () => {
  await resetSubmissions();
  await deleteCreatedAssignments();
});

test.describe('A1 / FR-ASG-5: session assignment list is member-only and filtered by role', () => {
  test('an enrolled student sees no answer keys and only their own submission', async ({ browser }) => {
    await seedEssaySubmission(101);
    await seedEssaySubmission(102); // a row for a non-enrolled student, so filtering is observable
    const student = await apiAs(browser, 'student');

    const res = await student.get(LIST_URL);
    expect(res.status()).toBe(200);
    const { data } = (await res.json()) as { data: Assignment[] };
    expect(data.map(a => a.id).sort()).toEqual([COURSE.assignmentId, COURSE.essayAssignmentId]);
    for (const option of data.flatMap(a => a.questions.flatMap(q => q.options))) {
      expect(option).not.toHaveProperty('is_correct');
    }
    const essay = data.find(a => a.id === COURSE.essayAssignmentId)!;
    expect(essay.submissions.map(s => s.student.id)).toEqual([101]);
  });

  test('the course teacher sees answer keys and every submission', async ({ browser }) => {
    await seedEssaySubmission(101);
    await seedEssaySubmission(102);
    const teacher = await apiAs(browser, 'teacher');

    const { data } = (await (await teacher.get(LIST_URL)).json()) as { data: Assignment[] };
    const options = data.flatMap(a => a.questions.flatMap(q => q.options));
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) expect(option).toHaveProperty('is_correct');
    const essay = data.find(a => a.id === COURSE.essayAssignmentId)!;
    expect(essay.submissions.map(s => s.student.id).sort()).toEqual([101, 102]);
  });

  for (const user of ['otherStudent', 'otherTeacher'] as const) {
    test(`${user} (not a course member) => 403 with no assignment data`, async ({ browser }) => {
      const client = await apiAs(browser, user);
      const res = await client.get(LIST_URL);
      expect(res.status()).toBe(403);
      expect(await res.json()).not.toHaveProperty('data');
    });
  }

  test('a session id under the wrong course code => 404', async ({ browser }) => {
    const teacher = await apiAs(browser, 'teacher');
    expect((await teacher.get(`/api/courses/XXX999/sessions/${COURSE.sessionId}/assignments`)).status()).toBe(404);
  });
});

test.describe('A2 / Q-07, Q-12: creating an assignment', () => {
  const body = {
    title: 'E2E Tugas Baru',
    assignment_type_id: 4,
    total_points: 10,
    attempts_allowed: 1,
    is_published: true,
    created_by: 101, // must be ignored
    questions: [],
  };

  for (const user of ['student', 'otherTeacher'] as const) {
    test(`${user} => 403 and no assignment row is created`, async ({ browser }) => {
      const client = await apiAs(browser, user);
      const res = await client.post(LIST_URL, { data: body });
      expect(res.status()).toBe(403);
      expect(await query('select id from assignments where id > 7001')).toEqual([]);
    });
  }

  test('the course teacher creates it, and created_by is the session user, not the body', async ({ browser }) => {
    const teacher = await apiAs(browser, 'teacher');
    const res = await teacher.post(LIST_URL, { data: body });
    expect(res.ok()).toBe(true);
    const rows = await query<{ created_by: number; session_id: number }>(
      'select created_by, session_id from assignments where id > 7001'
    );
    expect(rows).toEqual([{ created_by: 201, session_id: COURSE.sessionId }]);
  });
});

test.describe('A3 / Q-10: grading view is scoped to the URL assignment', () => {
  test('a submission of another assignment => 404 and none of its data', async ({ browser }) => {
    await query(
      `insert into assignment_submissions (assignment_id, student_id, attempt_number, status_id, submitted_at, total_score)
       values ($1, 101, 1, 10, now(), 4)`,
      [COURSE.assignmentId]
    );
    const [quizSubmission] = await submissionsFor(COURSE.assignmentId);
    const teacher = await apiAs(browser, 'teacher');

    const wrong = await teacher.get(`${gradeUrl(COURSE.essayAssignmentId)}?submission_id=${quizSubmission.id}`);
    expect(wrong.status()).toBe(404);
    expect(await wrong.json()).not.toHaveProperty('data');

    const right = await teacher.get(`${gradeUrl(COURSE.assignmentId)}?submission_id=${quizSubmission.id}`);
    expect(right.status()).toBe(200);
    expect((await right.json()).data.id).toBe(quizSubmission.id);
  });

  test('a non-numeric submission_id => 400', async ({ browser }) => {
    const teacher = await apiAs(browser, 'teacher');
    expect((await teacher.get(`${gradeUrl(COURSE.essayAssignmentId)}?submission_id=abc`)).status()).toBe(400);
  });
});

test.describe('A4 / FR-SUB-1: attempt limit under concurrency (real unique index)', () => {
  const answers = [
    { question_id: 1, selected_option_id: 11 },
    { question_id: 2, selected_option_id: 22 },
  ];

  test('two simultaneous submits on a 1-attempt quiz store exactly one submission', async ({ browser }) => {
    const student = await apiAs(browser, 'student');
    // Repeat to give the race window several chances; each round starts from zero submissions.
    for (let round = 0; round < 5; round++) {
      await resetSubmissions();
      const responses = await Promise.all([
        student.post(submitUrl(COURSE.assignmentId), { data: { answers } }),
        student.post(submitUrl(COURSE.assignmentId), { data: { answers } }),
      ]);
      const statuses = responses.map(r => r.status()).sort();
      test.info().annotations.push({ type: 'race-statuses', description: `round ${round}: ${statuses.join(',')}` });
      // Winner 200. Loser: 400 if it read the count after the commit, 409 if it lost on the index. Never 500.
      expect(statuses[0]).toBe(200);
      expect([400, 409]).toContain(statuses[1]);
      const rows = await submissionsFor(COURSE.assignmentId);
      expect(rows).toHaveLength(1);
      expect(rows[0].attempt_number).toBe(1);
      expect(await query('select count(*)::int as n from assignment_answers')).toEqual([{ n: 2 }]);
    }
  });

  // Characterization (no decided requirement for duplicate answers). The P2002 handler matches every
  // unique violation, including assignment_answers(submission_id, question_id), so a duplicate answer is
  // reported as "Maximum attempts reached". The transaction rolls back, so no attempt is consumed.
  test('[characterization DC-32] a duplicated question_id in one submit => 409 "Maximum attempts reached", nothing stored', async ({ browser }) => {
    const student = await apiAs(browser, 'student');
    const res = await student.post(submitUrl(COURSE.assignmentId), {
      data: { answers: [{ question_id: 1, selected_option_id: 11 }, { question_id: 1, selected_option_id: 12 }] },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('Maximum attempts reached');
    expect(await submissionsFor(COURSE.assignmentId)).toEqual([]);
  });
});

test.describe('A6 / Q-08, Q-09: upload content checks and private file serving', () => {
  const CONTEXT = 'e2e-regression';
  const uploadDir = resolve(process.cwd(), 'public', 'uploads', 'courses', COURSE.code, 'sessions', String(COURSE.sessionId), CONTEXT);
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

  test.afterAll(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  const form = (name: string, mimeType: string, buffer: Buffer) => ({
    file: { name, mimeType, buffer },
    courseCode: COURSE.code,
    sessionId: String(COURSE.sessionId),
    context: CONTEXT,
  });

  test('HTML renamed to .pdf => 415; a .pdf declared as text/html => 415', async ({ browser }) => {
    const teacher = await apiAs(browser, 'teacher');
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    expect((await teacher.post('/api/upload', { multipart: form('notes.pdf', 'application/pdf', html) })).status()).toBe(415);
    expect((await teacher.post('/api/upload', { multipart: form('notes.pdf', 'text/html', PDF) })).status()).toBe(415);
  });

  test('a non-member cannot upload into the course (403)', async ({ browser }) => {
    const outsider = await apiAs(browser, 'otherStudent');
    expect((await outsider.post('/api/upload', { multipart: form('notes.pdf', 'application/pdf', PDF) })).status()).toBe(403);
  });

  test('a real PDF uploads; members can download it, a non-member cannot', async ({ browser }) => {
    const teacher = await apiAs(browser, 'teacher');
    const res = await teacher.post('/api/upload', { multipart: form('notes.pdf', 'application/pdf', PDF) });
    expect(res.status()).toBe(200);
    const url: string = (await res.json()).data.url;
    expect(url).toContain(CONTEXT);

    const student = await apiAs(browser, 'student');
    const ok = await student.get(url);
    expect(ok.status()).toBe(200);
    expect(Buffer.from(await ok.body()).subarray(0, 5).toString()).toBe('%PDF-');

    const outsider = await apiAs(browser, 'otherStudent');
    expect((await outsider.get(url)).status()).toBe(403);
  });
});
