import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, E2E_PORT, serverEnv, type E2EServerMode } from './tests/e2e/support/env';

/**
 * E2E smoke suite (docs/qa/test-strategy.md §3). Runs the real app against a disposable
 * local Postgres (`lms_e2e_test`), seeded on every run. Never uses .env / .env.local DBs.
 * Prereq (once): create the DB and apply migrations — see tests/e2e/README.md.
 *
 * Server mode: `production` (`next build` + `next start`, the default on CI) or `dev` (`next dev`,
 * the local default). Override with E2E_SERVER_MODE. Production mode writes the build to `.next`.
 */
const CI = !!process.env.CI;
const SERVER_MODE: E2EServerMode =
  process.env.E2E_SERVER_MODE === 'production' || process.env.E2E_SERVER_MODE === 'dev'
    ? process.env.E2E_SERVER_MODE
    : CI
      ? 'production'
      : 'dev';

// Server output is kept as a test artifact (test-reports/ is uploaded by CI) as well as streamed
// into the runner log with a [WebServer] prefix. pipefail keeps a failed build from looking healthy.
const SERVER_LOG = 'test-reports/e2e-webserver.log';
const serverCommand =
  SERVER_MODE === 'production'
    ? `npx next build && npx next start -p ${E2E_PORT}`
    : `npx next dev --turbopack -p ${E2E_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false, // shared seeded database; specs reset the rows they mutate
  workers: 1,
  // One retry on CI so a flaky test is identified as flaky rather than as a plain failure, and
  // failOnFlakyTests keeps a pass-on-retry red until stability has been shown.
  retries: CI ? 1 : 0,
  failOnFlakyTests: CI,
  forbidOnly: CI,
  reporter: [['list'], ['json', { outputFile: 'test-reports/e2e-results.json' }], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_BASE_URL,
    // Keeps the trace of every failed attempt, including a first attempt that passed on retry.
    trace: 'retain-on-failure-and-retries',
    screenshot: 'only-on-failure',
    video: 'off',
    // Optional: point at an already-installed Chromium instead of the build Playwright pins
    // (avoids a browser download when the cached build is older).
    launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `mkdir -p test-reports && bash -o pipefail -c '(${serverCommand}) 2>&1 | tee ${SERVER_LOG}'`,
    url: `${E2E_BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: SERVER_MODE === 'production' ? 600_000 : 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: serverEnv(SERVER_MODE),
  },
});
