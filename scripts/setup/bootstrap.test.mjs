import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateBootstrapInput } from './bootstrap-core.mjs';

test('bootstrap validates credentials before opening the database', () => {
  const good = { username: 'initial_admin', email: 'admin@example.invalid', name: 'Administrator', code: 'ADMIN-001', password: 'test-only-password-long' };
  assert.deepEqual(validateBootstrapInput(good), good);
  for (const patch of [{ username: '' }, { email: 'bad' }, { name: '' }, { code: '' }, { password: 'short' }, { password: '界'.repeat(25) }]) {
    assert.throws(() => validateBootstrapInput({ ...good, ...patch }));
  }
});
