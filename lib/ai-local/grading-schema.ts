/**
 * JSON Schema for `GradingResult`, handed to Ollama as `format`.
 *
 * This drives grammar-constrained decoding: the sampler can only emit tokens
 * that keep the output a valid instance of this schema. That is a far stronger
 * guarantee than asking the model for JSON in the prompt, and it is what makes
 * the local path's parse rate comparable to OpenAI's `json_object` mode.
 *
 * The shape must stay in lockstep with `lib/types/correction.ts` — a schema
 * that permits a field the type does not have would produce rows that fail
 * silently downstream.
 */
export const GRADING_RESULT_SCHEMA: Record<string, unknown> = Object.freeze({
  type: 'object',
  properties: {
    score: { type: ['number', 'null'] },
    max_score: { type: 'number' },
    qualitative_grade: { type: ['string', 'null'], enum: ['Excellent', 'Good', 'Fair', 'Poor', null] },
    feedback: { type: 'string' },
    citations: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    rubric_alignment: {
      type: 'object',
      additionalProperties: { type: 'string', enum: ['pass', 'fail'] },
    },
    language_detected: { type: 'string', enum: ['id', 'en'] },
    token_usage_estimate: { type: 'number' },
  },
  required: [
    'score',
    'max_score',
    'qualitative_grade',
    'feedback',
    'citations',
    'confidence',
    'rubric_alignment',
    'language_detected',
    'token_usage_estimate',
  ],
});
