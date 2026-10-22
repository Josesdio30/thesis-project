/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // scripts/ holds plain Node tooling with its own `node --test` suites (ESM),
  // which Jest cannot parse. .agents/ holds installed agent skills whose own
  // .test.cjs files are not part of this app.
  // tests/e2e/ holds Playwright specs (run with `npx playwright test`), not Jest tests.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/scripts/', '<rootDir>/.agents/', '<rootDir>/tests/e2e/'],
  restoreMocks: true,
  // Module-factory mocks are not spies, so restoreMocks does not touch them and
  // call history leaks between tests in the same file.
  clearMocks: true,
  collectCoverageFrom: [
    'lib/ai/**/*.ts',
    'lib/ai-local/**/*.ts',
    'middleware.ts',
    'lib/auth/**/*.ts',
    'lib/crypto.ts',
    'lib/feature-access.ts',
    'lib/score-view-utils.ts',
    'app/api/upload/route.ts',
    'app/api/courses/[[]code]/sessions/[[]sessionId]/assignments/route.ts',
    'app/api/courses/[[]code]/sessions/[[]sessionId]/assignments/[[]assignmentId]/grade/route.ts',
    'app/api/courses/[[]code]/sessions/[[]sessionId]/assignments/[[]assignmentId]/submit/route.ts',
  ],
  // Scoped rather than global on purpose. `.coverage-thresholds.json` declares
  // 100% as a blocking gate, but jest has never enforced anything — a global
  // threshold would fail instantly against ~40 pre-existing untested route and
  // component files. Gating the new provider code actually enforces the rule
  // where it applies, without freezing the rest of the repo.
  coverageThreshold: {
    './lib/ai/': { lines: 100, branches: 100, functions: 100, statements: 100 },
    './lib/ai-local/': { lines: 100, branches: 100, functions: 100, statements: 100 },
    // QA Sprint 1 (docs/qa/test-plan-sprint-1.md): each newly tested area is
    // added here so the 100%-on-new-code rule is enforced per path.
    './middleware.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
    './lib/auth/': { lines: 100, branches: 100, functions: 100, statements: 100 },
    './lib/crypto.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
    './lib/feature-access.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
    './lib/score-view-utils.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
    // QA Phase 3 fixes A1-A7 (docs/qa/defect-candidates.md).
    './app/api/upload/route.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
    './app/api/courses/[code]/sessions/[sessionId]/assignments/route.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
    './app/api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/grade/route.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
    './app/api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/submit/route.ts': { lines: 100, branches: 100, functions: 100, statements: 100 },
    // Not gated: lib/scoringUtils.ts and lib/plagiarism/similarity.ts each
    // contain an unreachable branch (DC-16, DC-19), so 100% needs
    // an app-code fix first. Both are tested; see docs/qa/defect-candidates.md.
  },
};
