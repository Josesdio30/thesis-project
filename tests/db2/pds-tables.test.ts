import { pdsTables, PDS_TABLES_OPENAI, PDS_TABLES_LOCAL } from '@/lib/db2/pds-repo';

describe('pdsTables', () => {
  it('maps each provider to its own physical schema', () => {
    expect(pdsTables('openai')).toBe(PDS_TABLES_OPENAI);
    expect(pdsTables('local')).toBe(PDS_TABLES_LOCAL);
  });

  // The two sets must not overlap anywhere. A single shared table would let a
  // local run's cleanup cascade into the frozen OpenAI baseline.
  it('shares no table name between the two sets', () => {
    const baseline = Object.values(PDS_TABLES_OPENAI);
    const local = Object.values(PDS_TABLES_LOCAL);
    expect(baseline.filter(name => local.includes(name))).toEqual([]);
    expect(new Set([...baseline, ...local]).size).toBe(baseline.length + local.length);
  });

  it('covers the same keys in both sets', () => {
    expect(Object.keys(PDS_TABLES_LOCAL).sort()).toEqual(Object.keys(PDS_TABLES_OPENAI).sort());
  });

  // Table names are interpolated into SQL, so this throw is what guarantees a
  // name can never originate anywhere but these two frozen constants.
  it('throws on an unknown provider instead of returning a default', () => {
    expect(() => pdsTables('postgres' as never)).toThrow(/unknown provider "postgres"/);
  });

  it('exposes frozen constants', () => {
    expect(Object.isFrozen(PDS_TABLES_OPENAI)).toBe(true);
    expect(Object.isFrozen(PDS_TABLES_LOCAL)).toBe(true);
  });
});
