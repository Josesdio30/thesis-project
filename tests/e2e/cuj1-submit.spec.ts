/**
 * CUJ-1 — student opens a published assignment, answers, submits, gets the auto-score.
 * Requirements: FR-SUB-1, FR-SUB-2, FR-SUB-4, FR-SUB-5, FR-SUB-6 (route logic is covered exhaustively in
 * tests/api/submit-route.test.ts; E2E proves the wiring: UI -> API -> real SQL -> UI).
 * Oracles: database rows (source of truth), the student's card/modal text, API status codes.
 */
import { test, expect, type Page } from '@playwright/test';
import { COURSE } from './support/env';
import { loginAndLand } from './support/auth';
import { answersFor, resetSubmissions, submissionsFor } from './support/db';

async function openAssignment(page: Page, title: string) {
  await page.goto(`/course/${COURSE.code}?tab=Assignment`);
  await page.getByRole('heading', { name: title }).click();
  await page.getByRole('button', { name: /^Questions \(\d+\)$/ }).click();
}

async function choose(page: Page, questionIndex: number, optionLabel: string) {
  await page.getByRole('combobox').nth(questionIndex).click();
  await page.getByRole('option', { name: optionLabel }).click();
}

test.describe('CUJ-1 student submission', () => {
  test.beforeEach(async () => {
    await resetSubmissions();
  });

  test('FR-SUB-4/6: two correct MC answers are stored as attempt 1, SUBMITTED, 4/4 points', async ({ page }) => {
    await loginAndLand(page, 'student');
    await openAssignment(page, 'Kuis Aljabar');
    await expect(page.getByRole('button', { name: 'Submit Assignment' })).toBeVisible();
    await choose(page, 0, 'A. 7'); // 3 + 4 = 7 (correct)
    await choose(page, 1, 'B. 4'); // 6 - 2 = 4 (correct)
    await page.getByRole('button', { name: 'Submit Assignment' }).click();

    await expect.poll(async () => (await submissionsFor(COURSE.assignmentId)).length).toBe(1);
    const [submission] = await submissionsFor(COURSE.assignmentId);
    expect(submission).toMatchObject({ student_id: 101, attempt_number: 1, status: 'SUBMITTED' });
    expect(Number(submission.total_score)).toBe(4);
    const answers = await answersFor(submission.id);
    expect(answers.map(a => Number(a.points_earned))).toEqual([2, 2]);
  });

  test('FR-SUB-4: one wrong answer earns no partial credit for that question (2/4)', async ({ page }) => {
    await loginAndLand(page, 'student');
    await openAssignment(page, 'Kuis Aljabar');
    await choose(page, 0, 'A. 7'); // correct
    await choose(page, 1, 'A. 5'); // wrong
    await page.getByRole('button', { name: 'Submit Assignment' }).click();

    await expect.poll(async () => (await submissionsFor(COURSE.assignmentId)).length).toBe(1);
    const [submission] = await submissionsFor(COURSE.assignmentId);
    expect(Number(submission.total_score)).toBe(2);
    expect((await answersFor(submission.id)).map(a => Number(a.points_earned))).toEqual([2, 0]);
  });

  test('FR-SUB-1: after submitting, the assignment can no longer be submitted from the UI or the API', async ({ page }) => {
    await loginAndLand(page, 'student');
    await openAssignment(page, 'Kuis Aljabar');
    await choose(page, 0, 'A. 7');
    await choose(page, 1, 'B. 4');
    await page.getByRole('button', { name: 'Submit Assignment' }).click();
    await expect.poll(async () => (await submissionsFor(COURSE.assignmentId)).length).toBe(1);

    await openAssignment(page, 'Kuis Aljabar');
    await expect(page.getByText('You have already submitted this assignment.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit Assignment' })).toHaveCount(0);

    const retry = await page.request.post(
      `/api/courses/${COURSE.code}/sessions/${COURSE.sessionId}/assignments/${COURSE.assignmentId}/submit`,
      { data: { answers: [{ question_id: 1, selected_option_id: 11 }] } }
    );
    expect(retry.status()).toBe(400);
    expect((await retry.json()).error).toBe('Maximum attempts reached');
    expect(await submissionsFor(COURSE.assignmentId)).toHaveLength(1);
  });

  test('FR-SUB-5: an assignment with an essay is stored with no total_score until a teacher grades it', async ({ page }) => {
    await loginAndLand(page, 'student');
    await openAssignment(page, 'Esai Statistika');
    await choose(page, 0, 'A. 4');
    await page.getByRole('textbox').last().fill('Mean adalah rata-rata, median adalah nilai tengah.');
    await page.getByRole('button', { name: 'Submit Assignment' }).click();

    await expect.poll(async () => (await submissionsFor(COURSE.essayAssignmentId)).length).toBe(1);
    const [submission] = await submissionsFor(COURSE.essayAssignmentId);
    expect(submission.total_score).toBeNull();
    expect(submission.status).toBe('SUBMITTED');
    const answers = await answersFor(submission.id);
    expect(answers.find(a => a.question_id === 3)?.points_earned).toBe('2.00');
    expect(answers.find(a => a.question_id === 4)).toMatchObject({
      points_earned: '0.00',
      feedback: 'Requires manual grading',
    });
  });

  test('FR-SUB-2 / CUJ-3: a student who is not enrolled cannot submit (403, nothing stored)', async ({ page }) => {
    await loginAndLand(page, 'otherStudent');
    const res = await page.request.post(
      `/api/courses/${COURSE.code}/sessions/${COURSE.sessionId}/assignments/${COURSE.assignmentId}/submit`,
      { data: { answers: [{ question_id: 1, selected_option_id: 11 }] } }
    );
    expect(res.status()).toBe(403);
    expect(await submissionsFor(COURSE.assignmentId)).toHaveLength(0);
  });

  test('FR-SUB-2: a body student_id naming another student is ignored; the session student is recorded', async ({ page }) => {
    await loginAndLand(page, 'student');
    const res = await page.request.post(
      `/api/courses/${COURSE.code}/sessions/${COURSE.sessionId}/assignments/${COURSE.assignmentId}/submit`,
      { data: { student_id: 102, answers: [{ question_id: 1, selected_option_id: 11 }] } }
    );
    expect(res.status()).toBe(200);
    const rows = await submissionsFor(COURSE.assignmentId);
    expect(rows).toHaveLength(1);
    expect(rows[0].student_id).toBe(101);
  });
});
