/**
 * Analytic scoring for the local provider (`LOCAL_SCORING_MODE=analytic`).
 *
 * A holistic 0-100 number from the local model is poorly calibrated: it drifts
 * from the model's own feedback, ignores the rubric weights and can overflow
 * the scale. Here the model only picks a categorical level per rubric criterion
 * and the score is computed from the rubric weights, so it is bounded by
 * construction and subject-neutral.
 */
import { GRADING_RESULT_SCHEMA } from '@/lib/ai-local/grading-schema';

export const ANALYTIC_LEVELS = ['full', 'partial', 'minimal', 'none'] as const;
export type AnalyticLevel = (typeof ANALYTIC_LEVELS)[number];

// A-priori study constants, fixed before any results were seen and documented
// with the study. Changing them defines a new study config, not a tweak.
export const LEVEL_VALUES: Readonly<Record<AnalyticLevel, number>> = Object.freeze({
  full: 1,
  partial: 0.6,
  minimal: 0.3,
  none: 0,
});

function isLevel(value: unknown): value is AnalyticLevel {
  return typeof value === 'string' && (ANALYTIC_LEVELS as readonly string[]).includes(value);
}

/** `GRADING_RESULT_SCHEMA` plus a `criterion_levels` object that grammar-constrained decoding must fill completely. */
export function buildAnalyticSchema(criteriaNames: string[]): Record<string, unknown> {
  const base = GRADING_RESULT_SCHEMA as { properties: Record<string, unknown>; required: string[] };
  const levelProperties: Record<string, unknown> = {};
  for (const name of criteriaNames) {
    levelProperties[name] = { type: 'string', enum: [...ANALYTIC_LEVELS] };
  }
  return {
    ...GRADING_RESULT_SCHEMA,
    properties: {
      ...base.properties,
      criterion_levels: {
        type: 'object',
        properties: levelProperties,
        required: [...criteriaNames],
        additionalProperties: false,
      },
    },
    required: [...base.required, 'criterion_levels'],
  };
}

/** Weighted mean of the level values times `maxScore`, to one decimal; null when it cannot be computed honestly. */
export function computeAnalyticScore(
  levels: unknown,
  criteria: Record<string, number>,
  maxScore: number
): number | null {
  if (typeof levels !== 'object' || levels === null || Array.isArray(levels)) return null;
  const given = levels as Record<string, unknown>;

  let weightSum = 0;
  let weighted = 0;
  for (const [name, weight] of Object.entries(criteria)) {
    const level = Object.prototype.hasOwnProperty.call(given, name) ? given[name] : undefined;
    if (!isLevel(level)) return null;
    weightSum += weight;
    weighted += weight * LEVEL_VALUES[level];
  }
  if (weightSum <= 0) return null;

  return Math.round((weighted / weightSum) * maxScore * 10) / 10;
}

/** Appended to the system prompt in analytic mode. Versioned here; the audit's `scoring_mode` records its use. */
export function ANALYTIC_INSTRUCTIONS(criteriaNames: string[]): string {
  const names = criteriaNames.map(name => `"${name}"`).join(', ');
  return [
    'ANALYTIC SCORING',
    `Rate each rubric criterion in the "criterion_levels" object, one entry per criterion: ${names}.`,
    'Use exactly one of these levels:',
    '- full: the answer meets the criterion.',
    '- partial: relevant and partly right, but with a clear gap or error.',
    '- minimal: barely addresses the criterion.',
    '- none: absent or wrong.',
    'Judge the reasoning, not only the chosen option or label.',
    'The numeric "score" is computed by the system from these levels and the rubric weights.',
  ].join('\n');
}
