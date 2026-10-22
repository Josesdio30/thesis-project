import {
  ANALYTIC_INSTRUCTIONS,
  ANALYTIC_LEVELS,
  LEVEL_VALUES,
  buildAnalyticSchema,
  computeAnalyticScore,
} from '@/lib/ai-local/analytic-scoring';
import { GRADING_RESULT_SCHEMA } from '@/lib/ai-local/grading-schema';

const CRITERIA = { 'Content & Accuracy': 50, 'Critical Thinking': 30, Completeness: 10, 'Writing Quality': 10 };

describe('level constants', () => {
  it('orders the levels from best to worst with fixed values', () => {
    expect(ANALYTIC_LEVELS).toEqual(['full', 'partial', 'minimal', 'none']);
    expect(LEVEL_VALUES).toEqual({ full: 1, partial: 0.6, minimal: 0.3, none: 0 });
  });
});

describe('buildAnalyticSchema', () => {
  it('extends the grading schema with one required enum per criterion', () => {
    const schema = buildAnalyticSchema(Object.keys(CRITERIA)) as {
      properties: Record<string, unknown>;
      required: string[];
    };
    const levels = schema.properties.criterion_levels as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: boolean;
    };

    expect(schema.required).toEqual([...(GRADING_RESULT_SCHEMA.required as string[]), 'criterion_levels']);
    expect(schema.properties.score).toEqual({ type: ['number', 'null'] });
    expect(levels.type).toBe('object');
    expect(levels.additionalProperties).toBe(false);
    expect(levels.required).toEqual(Object.keys(CRITERIA));
    expect(Object.keys(levels.properties)).toEqual(Object.keys(CRITERIA));
    for (const name of Object.keys(CRITERIA)) {
      expect(levels.properties[name]).toEqual({ type: 'string', enum: ['full', 'partial', 'minimal', 'none'] });
    }
  });

  it('leaves the frozen base schema untouched', () => {
    const before = JSON.stringify(GRADING_RESULT_SCHEMA);
    buildAnalyticSchema(['a']);
    expect(JSON.stringify(GRADING_RESULT_SCHEMA)).toBe(before);
    expect((GRADING_RESULT_SCHEMA.properties as Record<string, unknown>).criterion_levels).toBeUndefined();
  });
});

describe('computeAnalyticScore', () => {
  it('weights each level by its criterion', () => {
    const levels = {
      'Content & Accuracy': 'full',
      'Critical Thinking': 'partial',
      Completeness: 'minimal',
      'Writing Quality': 'none',
    };
    // (50*1 + 30*0.6 + 10*0.3 + 10*0) / 100 * 100 = 71
    expect(computeAnalyticScore(levels, CRITERIA, 100)).toBe(71);
  });

  it('scales to the rubric maximum and rounds to one decimal', () => {
    const levels = { a: 'partial', b: 'minimal', c: 'full' };
    // (1*0.6 + 1*0.3 + 1*1) / 3 * 10 = 6.333...
    expect(computeAnalyticScore(levels, { a: 1, b: 1, c: 1 }, 10)).toBe(6.3);
  });

  it('ignores extra keys in the levels', () => {
    expect(computeAnalyticScore({ a: 'full', stray: 'none' }, { a: 5 }, 100)).toBe(100);
  });

  it('returns null when a criterion has no level', () => {
    expect(computeAnalyticScore({ a: 'full' }, { a: 1, b: 1 }, 100)).toBeNull();
  });

  it('returns null for an unknown level', () => {
    expect(computeAnalyticScore({ a: 'mostly' }, { a: 1 }, 100)).toBeNull();
  });

  it.each([undefined, null, 'full', ['full']])('returns null when levels is not an object (%p)', levels => {
    expect(computeAnalyticScore(levels, { a: 1 }, 100)).toBeNull();
  });

  it('does not treat inherited keys as levels', () => {
    expect(computeAnalyticScore({}, { toString: 1 }, 100)).toBeNull();
  });

  it.each<Record<string, number>>([{}, { a: 0 }, { a: 2, b: -2 }])('returns null when the weights sum to zero or less (%p)', criteria => {
    expect(computeAnalyticScore({ a: 'full', b: 'full' }, criteria, 100)).toBeNull();
  });
});

describe('ANALYTIC_INSTRUCTIONS', () => {
  it('names every criterion and defines the levels', () => {
    const text = ANALYTIC_INSTRUCTIONS(['Content & Accuracy', 'Completeness']);
    expect(text).toContain('criterion_levels');
    expect(text).toContain('"Content & Accuracy"');
    expect(text).toContain('"Completeness"');
    for (const level of ANALYTIC_LEVELS) expect(text).toContain(level);
    expect(text).toMatch(/reasoning/);
    expect(text).toMatch(/score.*computed/i);
  });
});
