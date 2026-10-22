import {
  SIMILARITY_THRESHOLDS,
  calculateCombinedScore,
  calculateRiskLevel,
  zScoreToNormalizedScore,
} from '@/lib/plagiarism/similarity';

const EPS = 1e-9;

describe('FR-PDS-4: risk thresholds (HIGH ≥ 0.80, MEDIUM ≥ 0.60, LOW ≥ 0.40)', () => {
  test('FR-PDS-4: the thresholds are the documented values', () => {
    expect(SIMILARITY_THRESHOLDS).toEqual({ HIGH: 0.8, MEDIUM: 0.6, LOW: 0.4, NONE: 0 });
  });

  test.each([
    [0.8, 'HIGH'],
    [0.8 - EPS, 'MEDIUM'],
    [0.6, 'MEDIUM'],
    [0.6 - EPS, 'LOW'],
    [0.4, 'LOW'],
    [0.4 - EPS, 'NONE'],
    [1, 'HIGH'],
    [0, 'NONE'],
    [-0.1, 'NONE'],
  ] as const)('FR-PDS-4: score %d → %s', (score, level) => {
    expect(calculateRiskLevel(score)).toBe(level);
  });
});

describe('FR-PDS-8: fixed-weight combined score (fallback mode, < 15 pairs)', () => {
  test('the semantic soft gate starts at exactly 0.3', () => {
    // Below 0.3 the semantic term is halved; at 0.3 it is not.
    expect(calculateCombinedScore(0.3 - EPS, 0)).toBeCloseTo(0.55 * 0.15, 6);
    expect(calculateCombinedScore(0.3, 0)).toBeCloseTo(0.55 * 0.3, 6);
  });

  test('a score above 1 is clamped to 1', () => {
    expect(calculateCombinedScore(1.5, 1.5)).toBe(1);
  });

  test('NaN inputs yield 0 rather than NaN', () => {
    expect(calculateCombinedScore(Number.NaN, 0.5)).toBe(0);
  });

  test('an exact copy (1, 1) is HIGH and a paraphrase-like pair (0.78, 0.15) is LOW', () => {
    expect(calculateRiskLevel(calculateCombinedScore(1, 1))).toBe('HIGH');
    // 0.55 × 0.78 + 0.45 × 0.15 = 0.4965. The doc comment in similarity.ts
    // still describes the old 0.3/0.7 weights (O-33), under which this was NONE.
    expect(calculateCombinedScore(0.78, 0.15)).toBeCloseTo(0.4965, 4);
    expect(calculateRiskLevel(calculateCombinedScore(0.78, 0.15))).toBe('LOW');
  });
});

describe('FR-PDS-8: z-score mode mapping (≥ 15 pairs)', () => {
  test.each([
    [-1, 0],
    [0, 0],
    [1.5, 0.5],
    [3, 1],
    [4, 1],
  ])('z = %d maps to %d', (z, expected) => {
    expect(zScoreToNormalizedScore(z)).toBeCloseTo(expected, 10);
  });

  test.each([
    [1.21, 'LOW'],
    [1.81, 'MEDIUM'],
    [2.41, 'HIGH'],
  ] as const)('a pair just above the documented σ boundary (z = %d) is %s', (z, level) => {
    expect(calculateRiskLevel(zScoreToNormalizedScore(z))).toBe(level);
  });

  describe('characterization: floating-point behaviour exactly on the σ boundaries', () => {
    // RISK DC-15: the doc comment says z = 1.2 / 1.8 / 2.4 land on the LOW /
    // MEDIUM / HIGH thresholds, but z / 3 is 0.39999…, 0.6 and 0.79999… in
    // IEEE-754, so a pair exactly on 1.2σ is NONE and exactly on 2.4σ is MEDIUM.
    test.each([
      [1.2, 'NONE'],
      [1.8, 'MEDIUM'],
      [2.4, 'MEDIUM'],
    ] as const)('DC-15: z = %d exactly → %s', (z, level) => {
      expect(calculateRiskLevel(zScoreToNormalizedScore(z))).toBe(level);
    });
  });
});
