/** Direct reads/writes on the disposable E2E database: data oracles and per-test reset. */
import { Client } from 'pg';
import { E2E_DATABASE_URL, assertSafeTestDatabase } from './env';

export async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  assertSafeTestDatabase();
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

export const query = <T extends object = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  withDb(async db => (await db.query(sql, params)).rows as T[]);

/** Removes every submission so each test starts from the seeded world. */
export async function resetSubmissions(): Promise<void> {
  await withDb(async db => {
    await db.query('truncate assignment_answers, assignment_submissions restart identity cascade');
  });
}

export interface SubmissionRow {
  id: number;
  student_id: number;
  assignment_id: number;
  attempt_number: number;
  total_score: string | null;
  status: string;
  graded_by: number | null;
  graded_at: Date | null;
  feedback: string | null;
}

export const submissionsFor = (assignmentId: number) =>
  query<SubmissionRow>(
    `select s.id, s.student_id, s.assignment_id, s.attempt_number, s.total_score, e.name as status,
            s.graded_by, s.graded_at, s.feedback
       from assignment_submissions s join enumeration e on e.id = s.status_id
      where s.assignment_id = $1 order by s.id`,
    [assignmentId]
  );

export const answersFor = (submissionId: number) =>
  query<{ question_id: number; points_earned: string; feedback: string | null; answer_text: string | null }>(
    'select question_id, points_earned, feedback, answer_text from assignment_answers where submission_id = $1 order by question_id',
    [submissionId]
  );

/** A student's essay-assignment submission as it would exist after CUJ-1 (MC auto-scored 2/2, essay waiting). */
export async function seedEssaySubmission(studentId = 101): Promise<number> {
  return withDb(async db => {
    const { rows } = await db.query(
      `insert into assignment_submissions (assignment_id, student_id, attempt_number, status_id, submitted_at, total_score)
       values (7001, $1, 1, 10, now(), null) returning id`,
      [studentId]
    );
    const id = rows[0].id as number;
    await db.query(
      `insert into assignment_answers (submission_id, question_id, selected_option_id, points_earned, feedback)
       values ($1, 3, 31, 2, 'Auto-graded')`,
      [id]
    );
    await db.query(
      `insert into assignment_answers (submission_id, question_id, answer_text, points_earned, feedback)
       values ($1, 4, 'Mean adalah rata-rata, median adalah nilai tengah data terurut.', 0, 'Requires manual grading')`,
      [id]
    );
    return id;
  });
}
