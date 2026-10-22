/**
 * Isolated environment for the Playwright suite (docs/qa/test-strategy.md §6, risk B-6).
 *
 * The app server is started with EVERY database variable pinned to a disposable
 * local database. Next.js auto-loads `.env` / `.env.local` (real dev credentials),
 * but process variables win, so anything not overridden here would leak through —
 * including credentials used by raw database helpers. DC-21's source fallback is removed.
 */
import os from 'os';

export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DB_NAME = 'lms_e2e_test';
const DB_HOST = '127.0.0.1';
const DB_PORT = process.env.E2E_DB_PORT || '5432';
if (!/^\d+$/.test(DB_PORT) || Number(DB_PORT) < 1 || Number(DB_PORT) > 65535) {
  throw new Error('E2E_DB_PORT must be an integer between 1 and 65535');
}
const DB_USER = process.env.E2E_DB_USER || os.userInfo().username;
const DB_PASSWORD = process.env.E2E_DB_PASSWORD || '';

const credentials = DB_PASSWORD ? `${DB_USER}:${encodeURIComponent(DB_PASSWORD)}` : DB_USER;
export const E2E_DATABASE_URL = `postgresql://${credentials}@${DB_HOST}:${DB_PORT}/${E2E_DB_NAME}`;

/** Refuses to run against anything but the disposable local test database. */
export function assertSafeTestDatabase(url: string = E2E_DATABASE_URL): void {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, '');
  const localHosts = ['127.0.0.1', 'localhost', '::1', '[::1]'];
  if (!localHosts.includes(parsed.hostname) || !name.endsWith('_e2e_test')) {
    throw new Error(`Refusing to touch "${parsed.hostname}/${name}": E2E needs a local database named *_e2e_test.`);
  }
}

export type E2EServerMode = 'dev' | 'production';

/**
 * Environment for the app under test (`next dev`, or `next build` + `next start`): every DB-ish
 * variable points at the test database. The same values are used for the production build, so the
 * built app can never carry another database's settings.
 */
export function serverEnv(mode: E2EServerMode = 'dev'): Record<string, string> {
  assertSafeTestDatabase();
  return {
    NODE_ENV: mode === 'production' ? 'production' : 'development',
    DATABASE_URL: E2E_DATABASE_URL,
    LMS_POSTGRES_URL: E2E_DATABASE_URL,
    AUX_POSTGRES_URL: E2E_DATABASE_URL, // local ACS reads use the same disposable DB
    POSTGRES_HOST: DB_HOST,
    POSTGRES_PORT: DB_PORT,
    POSTGRES_DATABASE: E2E_DB_NAME,
    POSTGRES_USER: DB_USER,
    POSTGRES_PASSWORD: DB_PASSWORD,
    POSTGRES_SSL: 'disable',
    DB_HOST,
    DB_PORT,
    DB_NAME: E2E_DB_NAME,
    DB_USER,
    DB_PASSWORD,
    NEXTAUTH_URL: E2E_BASE_URL,
    NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
    NEXTAUTH_SECRET: 'e2e-only-secret-not-used-anywhere-else',
    CREDENTIAL_ENCRYPTION_SECRET: 'e2e-only-encryption-secret',
    AI_PROVIDER: 'local',
    OPENAI_API_KEY: '',
    NEXT_TELEMETRY_DISABLED: '1',
  };
}

export const USERS = {
  student: { id: 101, username: 'e2e_student', name: 'Siti Rahma', role: 'STUDENT' },
  otherStudent: { id: 102, username: 'e2e_student2', name: 'Bima Pratama', role: 'STUDENT' },
  teacher: { id: 201, username: 'e2e_teacher', name: 'Ibu Dewi Lestari', role: 'TEACHER' },
  otherTeacher: { id: 202, username: 'e2e_teacher2', name: 'Pak Agus Wibowo', role: 'TEACHER' },
  admin: { id: 301, username: 'e2e_admin', name: 'Admin Sekolah', role: 'ADMIN' },
} as const;
export type UserKey = keyof typeof USERS;

/** Test-only password for every seeded account; the database is disposable and local. */
export const E2E_PASSWORD = 'E2e-Only-Pw-7431!';
export const BAD_PASSWORD = 'definitely-not-the-password';

export const COURSE = { code: 'MAT001', sessionId: 700, assignmentId: 7000, essayAssignmentId: 7001 } as const;
