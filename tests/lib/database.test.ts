import { Pool } from 'pg';

jest.mock('pg', () => ({ Pool: jest.fn(() => ({ on: jest.fn() })) }));

const keys = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'LMS_POSTGRES_URL', 'DATABASE_URL'] as const;
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));

beforeEach(() => {
  for (const key of keys) delete process.env[key];
  (Pool as unknown as jest.Mock).mockClear();
});
afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

const load = () => jest.isolateModules(() => require('@/lib/database'));

test('missing configuration fails before constructing a pool', () => {
  expect(load).toThrow(/database configuration/i);
  expect(Pool).not.toHaveBeenCalled();
});

test('partial DB settings never invoke ambient pg defaults or source credentials', () => {
  process.env.DB_HOST = '127.0.0.1';
  expect(load).toThrow(/DB_/);
  expect(Pool).not.toHaveBeenCalled();
});

test('explicit DB settings support an empty local password', () => {
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '5432', DB_NAME: 'unit_test', DB_USER: 'unit', DB_PASSWORD: '' });
  load();
  expect(Pool).toHaveBeenCalledWith(expect.objectContaining({
    host: '127.0.0.1', port: 5432, database: 'unit_test', user: 'unit', password: '',
  }));
});

test.each(['DATABASE_URL', 'LMS_POSTGRES_URL'] as const)('%s explicitly configures the pool', key => {
  process.env[key] = 'postgresql://unit:dummy@127.0.0.1:5432/unit_test';
  load();
  expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ connectionString: process.env[key] }));
});

test.each(['abc', '5432junk', '0', '65536'])('invalid DB_PORT %s fails before pool creation', port => {
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: port, DB_NAME: 'unit_test', DB_USER: 'unit', DB_PASSWORD: '' });
  expect(load).toThrow(/DB_PORT/);
  expect(Pool).not.toHaveBeenCalled();
});
