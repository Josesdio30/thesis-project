# E2E smoke suite (Playwright)

Runs the real app (`next dev -p 3100`) against a **disposable local Postgres** named `lms_e2e_test`.
It never reads `.env` / `.env.local` databases: `tests/e2e/support/env.ts` pins every DB variable and
refuses any host that is not local or any database not named `*_e2e_test`.

## One-time setup

```bash
createdb -h 127.0.0.1 lms_e2e_test
DATABASE_URL="postgresql://$(whoami)@127.0.0.1:5432/lms_e2e_test" npx prisma migrate deploy
```

Override the local database port with `E2E_DB_PORT` (default `5432`), and credentials with `E2E_DB_USER` / `E2E_DB_PASSWORD` if your local Postgres needs a password.
Postgres must have pgvector available, and the test DB user must be able to create the
`vector` and `pgcrypto` extensions. Every run applies the canonical extensions, RAG,
and local ACS migrations to the disposable database before seeding. This supports
the grading modal's AI-results read even when no AI grading job exists.

## Run

```bash
npx playwright test --grep-invert "Test group"                          # local default: next dev
E2E_SERVER_MODE=production npx playwright test --grep-invert "Test group"  # next build + next start (CI default)
npx playwright show-report          # HTML report; traces are kept for failed and retried attempts
```

`seed.spec.ts` is the Playwright agents' empty seed file; `--grep-invert "Test group"` skips it.
Production mode builds into `.next` (it replaces a local dev build cache). The app server's output is
written to `test-reports/e2e-webserver.log`. With `CI` set, a failed test is retried once and a test
that only passes on the retry is reported as **flaky and fails the run** (`failOnFlakyTests`).

If Playwright's pinned Chromium is not installed, point it at one you already have:
`E2E_CHROMIUM_PATH=/path/to/chrome-headless-shell npx playwright test`.

The seed (`support/seed.ts`) wipes and refills the test DB on every run; each spec resets the submission
rows it mutates. Specs: `auth` (CUJ-7), `cuj1-submit`, `cuj2-grade`. The AI/plagiarism journeys (CUJ-5/6)
and expiry-by-clock are not covered here (no AI inference or plagiarism provider yet).
