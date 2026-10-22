import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const loader = path.resolve('scripts/lib/load-env.cjs');

test('CLI env follows Next.js: process > mode.local > local > mode > base, with dotenv expansion', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'lms-env-test-'));
  try {
    writeFileSync(path.join(root, '.env'), 'CHOICE=base\nBASE_ONLY=base\nEXPANDED=${BASE_ONLY}/value\n');
    writeFileSync(path.join(root, '.env.local'), 'CHOICE=local\nLOCAL_ONLY="value # literal"\n');
    writeFileSync(path.join(root, '.env.production'), 'CHOICE=production\nMODE_ONLY=mode\n');
    writeFileSync(path.join(root, '.env.production.local'), 'CHOICE=production-local\n');
    const run = extra => {
      const r = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(loader)}).loadProjectEnv(${JSON.stringify(root)}); console.log(JSON.stringify({choice:process.env.CHOICE,base:process.env.BASE_ONLY,expanded:process.env.EXPANDED,local:process.env.LOCAL_ONLY,mode:process.env.MODE_ONLY}));`], {
        env: { PATH: process.env.PATH, NODE_ENV: 'production', ...extra }, encoding: 'utf8',
      });
      assert.equal(r.status, 0, r.stderr);
      return JSON.parse(r.stdout.trim());
    };
    assert.deepEqual(run({}), { choice: 'production-local', base: 'base', expanded: 'base/value', local: 'value # literal', mode: 'mode' });
    assert.equal(run({ CHOICE: 'shell' }).choice, 'shell');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the Prisma wrapper forwards arguments and exit codes with loaded project env', () => {
  // The child reads only a non-secret sentinel; no DB connection.
  const r = spawnSync(process.execPath, ['scripts/env-run.mjs', '-e', 'process.exit(process.env.LMS_ENV_SENTINEL === "present" ? 7 : 8)'], {
    env: { PATH: process.env.PATH, NODE_ENV: 'test', LMS_ENV_SENTINEL: 'present' }, encoding: 'utf8',
  });
  assert.equal(r.status, 7, r.stderr);
});

test('E2E can target a disposable PostgreSQL instance on a separate port', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', 'const { E2E_DATABASE_URL } = await import("./tests/e2e/support/env.ts"); console.log(new URL(E2E_DATABASE_URL).port)'], {
    env: { PATH: process.env.PATH, E2E_DB_PORT: '55439' }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '55439');
});

test('a child terminated by SIGTERM cannot make the wrapper report success', () => {
  const r = spawnSync(process.execPath, ['scripts/env-run.mjs', '-e', 'process.kill(process.pid,"SIGTERM")'], {
    env: { PATH: process.env.PATH, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(r.signal, 'SIGTERM');
  assert.notEqual(r.status, 0);
});
