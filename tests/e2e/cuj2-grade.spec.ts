/**
 * CUJ-2 — teacher grades an essay submission; it becomes GRADED and the student sees the score.
 * Requirements: FR-GRD-1, FR-GRD-2, FR-GRD-3 (route rules: tests/api/grade-route.test.ts).
 * Oracles: database rows, the student's card text, API status codes. Bounds/total rules (Q-16/Q-17)
 * are undecided and therefore not asserted here.
 */
import { test, expect, type Page } from '@playwright/test';
import { COURSE } from './support/env';
import { loginAndLand } from './support/auth';
import { answersFor, resetSubmissions, seedEssaySubmission, submissionsFor } from './support/db';

async function openGradingModal(page: Page) {
  await page.goto(`/course/${COURSE.code}?tab=Assignment`);
  const card = page.locator('div.group', { has: page.getByRole('heading', { name: 'Esai Statistika' }) });
  await card.hover();
  await card.getByTitle('Grade Submissions').click();
  await expect(page.getByText('Grade Assignment: Esai Statistika')).toBeVisible();
}

test.describe('CUJ-2 manual grading', () => {
  test.beforeEach(async () => {
    await resetSubmissions();
  });

  test('FR-GRD-1/2: the teacher sees the waiting essay, saves points + feedback, and the submission becomes GRADED', async ({ page }) => {
    const submissionId = await seedEssaySubmission(101);
    await loginAndLand(page, 'teacher');
    await openGradingModal(page);

    await expect(page.getByText('Submissions to Grade (1)')).toBeVisible();
    const aiResultsResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === `/api/ai-grading/results/${COURSE.essayAssignmentId}`
    );
    await page.getByText('Siti Rahma').first().click();
    const aiResults = await aiResultsResponse;
    expect(aiResults.status()).toBe(200);
    expect(await aiResults.json()).toEqual({ success: true, data: { job: null, results: [] } });
    await expect(page.getByText('Mean adalah rata-rata, median adalah nilai tengah data terurut.')).toBeVisible();

    // <label> is not associated with its input in GradingModal (DC-22), so target the one enabled number field.
    await page.locator('input[type="number"]:not([disabled])').fill('8');
    await page.getByPlaceholder('Optional feedback for this question').last().fill('Definisi benar, contoh kurang.');
    const dialogMessage = new Promise<string>(resolve => page.once('dialog', d => { void d.accept(); resolve(d.message()); }));
    await page.getByRole('button', { name: 'Save Grades' }).click();
    expect(await dialogMessage).toBe('Grades saved successfully!');

    const [row] = await submissionsFor(COURSE.essayAssignmentId);
    expect(row).toMatchObject({ id: submissionId, status: 'GRADED', graded_by: 201 });
    expect(row.graded_at).not.toBeNull();
    expect(Number(row.total_score)).toBe(10); // 2 (auto MC, resent by the modal) + 8 (essay)
    const essay = (await answersFor(submissionId)).find(a => a.question_id === 4);
    expect(Number(essay?.points_earned)).toBe(8);
    expect(essay?.feedback).toBe('Definisi benar, contoh kurang.');
  });

  test('FR-GRD-2: the student sees the final score, no longer "Awaiting Review"', async ({ page }) => {
    await seedEssaySubmission(101);
    await loginAndLand(page, 'student');
    await page.goto(`/course/${COURSE.code}?tab=Assignment`);
    await expect(page.getByText('Awaiting Review', { exact: true })).toBeVisible();

    // grade through the real API as the teacher, then re-check the student's view
    const teacher = await page.context().browser()!.newContext({ baseURL: page.url().split('/course')[0] });
    const tPage = await teacher.newPage();
    await loginAndLand(tPage, 'teacher');
    const [pending] = await submissionsFor(COURSE.essayAssignmentId);
    const res = await tPage.request.post(
      `/api/courses/${COURSE.code}/sessions/${COURSE.sessionId}/assignments/${COURSE.essayAssignmentId}/grade`,
      {
        data: {
          submission_id: pending.id,
          grades: [
            { question_id: 3, points_earned: 2, feedback: 'ok' },
            { question_id: 4, points_earned: 9, feedback: 'bagus' },
          ],
          feedback: 'Baik',
        },
      }
    );
    expect(res.status()).toBe(200);
    await teacher.close();

    await page.reload();
    await expect(page.getByText('Awaiting Review')).toHaveCount(0);
    await expect(page.getByText('11/100', { exact: true })).toBeVisible();
  });

  test('FR-GRD-3 / CUJ-3: a student and a teacher of another course cannot read or write grades (403)', async ({ browser }) => {
    const submissionId = await seedEssaySubmission(101);
    const grade = (page: Page, method: 'get' | 'post') => {
      const url = `/api/courses/${COURSE.code}/sessions/${COURSE.sessionId}/assignments/${COURSE.essayAssignmentId}/grade`;
      return method === 'get'
        ? page.request.get(url)
        : page.request.post(url, {
            data: { submission_id: submissionId, grades: [{ question_id: 4, points_earned: 10, feedback: 'x' }] },
          });
    };

    for (const user of ['student', 'otherTeacher'] as const) {
      const context = await browser.newContext({ baseURL: 'http://localhost:3100' });
      const page = await context.newPage();
      await loginAndLand(page, user);
      expect((await grade(page, 'get')).status(), `${user} GET`).toBe(403);
      expect((await grade(page, 'post')).status(), `${user} POST`).toBe(403);
      await context.close();
    }
    const [row] = await submissionsFor(COURSE.essayAssignmentId);
    expect(row.status).toBe('SUBMITTED');
    expect(row.graded_by).toBeNull();
  });
});
