/**
 * Deterministic seed for the disposable E2E database. Wipes and refills it on every run.
 * Fixed IDs match tests/helpers/personas.ts. Never runs against a non-test database.
 *
 * World: course MAT001 (class_course 70) taught by teacher 201; student 101 enrolled,
 * student 102 NOT enrolled; teacher 202 teaches nothing. Session 700 holds
 *   - assignment 7000 "Kuis Aljabar": 2 MC questions (2 pts each), 1 attempt, auto-scored
 *   - assignment 7001 "Esai Statistika": 1 MC (2 pts) + 1 essay (10 pts), manual grading
 */
import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { E2E_DATABASE_URL, E2E_PASSWORD, USERS, assertSafeTestDatabase } from './env';

export async function seedDatabase(): Promise<void> {
  assertSafeTestDatabase();
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query<{ current_database: string }>('select current_database()');
    if (!rows[0].current_database.endsWith('_e2e_test')) throw new Error('Connected to a non-test database; aborting.');

    // The grading modal reads AI results even during manual grading. Use the
    // canonical local ACS schema and its RAG dependency in this isolated DB.
    // These migrations are idempotent; no development env or migration runner
    // is loaded here, so credentials stay pinned to the disposable database.
    await db.query('BEGIN');
    try {
      for (const migration of [
        '001_extensions.sql',
        'local/012_rag_tables.sql',
        'local/013_acs_local_tables.sql',
      ]) {
        await db.query(await readFile(resolve(__dirname, '../../../db/ai-db', migration), 'utf8'));
      }
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }

    const tables = await db.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and tablename not like '\\_prisma%'"
    );
    if (tables.rows.length) {
      await db.query(`truncate ${tables.rows.map(t => `"${t.tablename}"`).join(', ')} restart identity cascade`);
    }

    const hash = await bcrypt.hash(E2E_PASSWORD, 4);
    const enums: Array<[number, string, string]> = [
      [1, 'USER_ROLE', 'STUDENT'], [2, 'USER_ROLE', 'TEACHER'], [3, 'USER_ROLE', 'ADMIN'],
      [4, 'ASSIGNMENT_TYPE', 'QUIZ'], [5, 'ASSIGNMENT_TYPE', 'ESSAY'],
      [7, 'QUESTION_TYPE', 'MULTIPLE CHOICE'], [8, 'QUESTION_TYPE', 'TRUE FALSE'], [9, 'QUESTION_TYPE', 'ESSAY'],
      [10, 'SUBMISSION_STATUS', 'SUBMITTED'], [12, 'SUBMISSION_STATUS', 'GRADED'],
    ];
    for (const [id, category, name] of enums) {
      await db.query('insert into enumeration (id, category, name, is_active) values ($1,$2,$3,true)', [id, category, name]);
    }

    const roleId = { STUDENT: 1, TEACHER: 2, ADMIN: 3 } as const;
    for (const u of Object.values(USERS)) {
      await db.query(
        `insert into app_user (id, email, password, user_name, nama_lengkap, tanggal_lahir)
         values ($1,$2,$3,$4,$5,'2008-05-17')`,
        [u.id, `${u.username}@example.com`, hash, u.username, u.name]
      );
      await db.query('insert into app_user_role (role_id, user_id) values ($1,$2)', [roleId[u.role], u.id]);
      if (u.role === 'STUDENT') {
        await db.query('insert into student_details (user_id, nis) values ($1,$2)', [u.id, `NIS-${u.id}`]);
      } else if (u.role === 'TEACHER') {
        await db.query('insert into teacher_details (user_id, kode_guru) values ($1,$2)', [u.id, `G-${u.id}`]);
      } else {
        await db.query('insert into admin_details (user_id, kode_admin) values ($1,$2)', [u.id, `A-${u.id}`]);
      }
    }

    await db.query("insert into academic_years (id, year_name, start_date, end_date, is_active) values (1,'2026/2027','2026-07-01','2027-06-30',true)");
    await db.query("insert into classes (id, class_name, grade_level, year_id) values (5,'X-1','10',1)");
    await db.query("insert into courses (id, course_code, course_name, description) values (50,'MAT001','Matematika','Kelas sepuluh')");
    await db.query(
      `insert into class_courses (id, class_id, course_id, teacher_id, start_date, end_date, is_active)
       values (70,5,50,201,'2026-07-01','2027-06-30',true)`
    );
    await db.query('insert into enrollments (class_course_id, student_id, roll_number) values (70,101,1)');
    await db.query(
      `insert into sessions (id, class_course_id, title, description, session_number, start_time, end_time)
       values (700,70,'Pertemuan 1','Aljabar dasar',1,'2026-07-20 08:00','2026-07-20 09:30')`
    );

    const insertAssignment = (id: number, title: string, typeId: number) =>
      db.query(
        `insert into assignments (id, session_id, assignment_type_id, title, description, total_points,
           due_date, start_date, attempts_allowed, is_published, created_by)
         values ($1,700,$2,$3,'Kerjakan dengan teliti',100,'2099-01-01 00:00','2026-07-01 00:00',1,true,201)`,
        [id, typeId, title]
      );
    await insertAssignment(7000, 'Kuis Aljabar', 4);
    await insertAssignment(7001, 'Esai Statistika', 5);

    const question = (id: number, assignmentId: number, typeId: number, text: string, points: number, order: number) =>
      db.query(
        'insert into assignment_questions (id, assignment_id, question_type_id, question_text, points, order_number) values ($1,$2,$3,$4,$5,$6)',
        [id, assignmentId, typeId, text, points, order]
      );
    const option = (id: number, questionId: number, text: string, correct: boolean, order: number) =>
      db.query(
        'insert into assignment_question_options (id, question_id, option_text, is_correct, order_number) values ($1,$2,$3,$4,$5)',
        [id, questionId, text, correct, order]
      );

    // 7000: two MC questions, 2 points each
    await question(1, 7000, 7, 'Hasil dari 3 + 4 adalah?', 2, 1);
    await option(11, 1, '7', true, 1);
    await option(12, 1, '8', false, 2);
    await question(2, 7000, 7, 'Hasil dari 6 - 2 adalah?', 2, 2);
    await option(21, 2, '5', false, 1);
    await option(22, 2, '4', true, 2);

    // 7001: one MC (2 pts) + one essay (10 pts)
    await question(3, 7001, 7, 'Rata-rata dari 2, 4, 6 adalah?', 2, 1);
    await option(31, 3, '4', true, 1);
    await option(32, 3, '6', false, 2);
    await question(4, 7001, 9, 'Jelaskan perbedaan mean dan median.', 10, 2);

    // keep serial sequences ahead of the fixed ids so app inserts never collide
    for (const [table, max] of [
      ['app_user', 301], ['assignments', 7001], ['assignment_questions', 4],
      ['assignment_question_options', 32], ['sessions', 700], ['class_courses', 70],
    ] as const) {
      await db.query(`select setval(pg_get_serial_sequence('${table}','id'), $1)`, [max]);
    }
  } finally {
    await db.end();
  }
}
