import { resolvePostgresSsl, resolvePgPoolSsl } from '@/lib/pg-ssl';

describe('resolvePostgresSsl', () => {
  it.each(['false', 'off', '0', 'disable', 'FALSE', ' Off '])(
    'disables TLS when POSTGRES_SSL=%p',
    value => expect(resolvePostgresSsl({ POSTGRES_SSL: value } as never)).toBe(false)
  );

  it.each(['true', 'on', '1', 'require'])('enables TLS when POSTGRES_SSL=%p', value =>
    expect(resolvePostgresSsl({ POSTGRES_SSL: value } as never)).toEqual({ rejectUnauthorized: false })
  );

  // An explicit setting must win even in production — `next start` always runs
  // in production mode, including for a self-hosted local deployment.
  it('lets an explicit setting override the production default', () => {
    expect(resolvePostgresSsl({ NODE_ENV: 'production', POSTGRES_SSL: 'false' } as never)).toBe(false);
  });

  it('keeps the previous default when POSTGRES_SSL is unset', () => {
    expect(resolvePostgresSsl({ NODE_ENV: 'production' } as never)).toEqual({ rejectUnauthorized: false });
    expect(resolvePostgresSsl({ NODE_ENV: 'development' } as never)).toBe(false);
    expect(resolvePostgresSsl({} as never)).toBe(false);
  });
});

describe('resolvePgPoolSsl', () => {
  // `pg` treats false as "definitely no TLS" and undefined as "use defaults";
  // the distinction matters, so an unset POSTGRES_SSL must stay undefined.
  it('returns undefined when POSTGRES_SSL is unset and TLS is off', () => {
    expect(resolvePgPoolSsl({ NODE_ENV: 'development' } as never)).toBeUndefined();
  });

  it('returns false only when TLS was explicitly disabled', () => {
    expect(resolvePgPoolSsl({ POSTGRES_SSL: 'false', NODE_ENV: 'production' } as never)).toBe(false);
  });

  it('passes an enabled setting straight through', () => {
    expect(resolvePgPoolSsl({ NODE_ENV: 'production' } as never)).toEqual({ rejectUnauthorized: false });
  });
});
