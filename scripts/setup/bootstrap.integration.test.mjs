import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { bootstrapDatabase } from './bootstrap-core.mjs';

const url = process.env.LMS_SETUP_TEST_URL;
test('bootstrap against a real migrated, disposable PostgreSQL database', { skip: !url }, async t => {
  const target = new URL(url);
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
  assert.ok(target.pathname.endsWith('_setup_test'));
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const input = { username: 'setup_admin', email: 'admin@example.invalid', name: 'Setup Admin', code: 'SETUP-ADMIN' };
  const hash = await bcrypt.hash('test-only-setup-password', 12);
  const clear = () => client.query('TRUNCATE enumeration, app_user RESTART IDENTITY CASCADE');
  try {
    await clear();
    await t.test('creates fixed role IDs, master data, bcrypt admin and admin profile', async () => {
      assert.equal((await bootstrapDatabase(client, input, hash)).created, true);
      const { rows } = await client.query("SELECT id,name FROM enumeration WHERE category='ROLE' ORDER BY id");
      assert.deepEqual(rows, [{ id: 1, name: 'STUDENT' }, { id: 2, name: 'TEACHER' }, { id: 3, name: 'ADMIN' }]);
      const { rows: [user] } = await client.query('SELECT u.password,r.role_id,d.kode_admin FROM app_user u JOIN app_user_role r ON r.user_id=u.id JOIN admin_details d ON d.user_id=u.id');
      assert.equal(user.role_id, 3); assert.equal(user.kode_admin, 'SETUP-ADMIN');
      assert.ok(await bcrypt.compare('test-only-setup-password', user.password));
    });
    await t.test('rerun is idempotent and never resets the existing password', async () => {
      const { rows: before } = await client.query('SELECT id,password FROM app_user');
      const changed = await bcrypt.hash('different-test-only-password', 12);
      assert.equal((await bootstrapDatabase(client, input, changed)).created, false);
      assert.deepEqual((await client.query('SELECT id,password FROM app_user')).rows, before);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM enumeration')).rows[0].count, 13);
    });
    await t.test('conflicting account is rejected without modifying rows', async () => {
      await assert.rejects(bootstrapDatabase(client, { ...input, email: 'other@example.invalid' }, hash), /conflicts/);
      assert.equal((await client.query('SELECT email FROM app_user')).rows[0].email, input.email);
    });
    await t.test('incompatible role mapping is rejected before any seed/account writes', async () => {
      await clear();
      await client.query("INSERT INTO enumeration (id,name,category) VALUES (1,'ADMIN','ROLE')");
      await assert.rejects(bootstrapDatabase(client, input, hash), /Incompatible role mapping/);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM enumeration')).rows[0].count, 1);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM app_user')).rows[0].count, 0);
    });
    await t.test('late admin-code collision rolls back account, roles and master seed writes', async () => {
      await clear();
      await bootstrapDatabase(client, input, hash);
      await assert.rejects(bootstrapDatabase(client, { ...input, username: 'second_admin', email: 'second@example.invalid' }, hash));
      assert.equal((await client.query('SELECT count(*)::int AS count FROM app_user')).rows[0].count, 1);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM app_user_role')).rows[0].count, 1);
    });
  } finally { await client.end(); }
});
