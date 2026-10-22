import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const url = process.env.LMS_SETUP_AUX_TEST_URL;
test('AUX init and target guards against real disposable databases', { skip: !url }, async t => {
  const target = new URL(url);
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
  assert.ok(target.pathname.endsWith('_aux_setup_test'));
  const run = (args, connectionString = url) => spawnSync(process.execPath, ['db/ai-db/migrate.mjs', ...args], {
    env: { ...process.env, NODE_ENV: 'test', AUX_POSTGRES_URL: connectionString }, encoding: 'utf8', timeout: 30000,
  });
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await t.test('applies fresh schema or verifies a previously initialized schema', async () => {
      const r = run(['--init']);
      assert.equal(r.status, 0, r.stderr);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM schema_migrations_aux')).rows[0].count, 12);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM local_ai_config')).rows[0].count, 1);
    });
    await t.test('rerun is safe and all migration checksums remain valid', () => {
      const r = run(['--init']); assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /nothing to do/);
    });
    await t.test('cannot combine initialization and legacy baseline', () => {
      assert.notEqual(run(['--init', '--baseline']).status, 0);
    });
    await t.test('rejects nonempty untracked schema before creating a migration ledger', async () => {
      // A separate database exercises the public-schema guard without changing AUX tables.
      const guardDb = target.pathname.slice(1).replace('_aux_setup_test', '_guard_setup_test');
      assert.match(guardDb, /^[a-zA-Z0-9_]+$/);
      await client.query(`CREATE DATABASE "${guardDb}"`);
      const guardUrl = new URL(url); guardUrl.pathname = '/' + guardDb;
      const guard = new pg.Client({ connectionString: guardUrl.href }); await guard.connect();
      try {
        await guard.query('CREATE TABLE unrelated (id integer)');
        const r = run(['--init'], guardUrl.href);
        assert.notEqual(r.status, 0); assert.match(r.stderr, /empty public schema/);
        assert.equal((await guard.query("SELECT to_regclass('schema_migrations_aux') AS name")).rows[0].name, null);
      } finally { await guard.end(); await client.query(`DROP DATABASE "${guardDb}"`); }
    });
  } finally { await client.end(); }
});
