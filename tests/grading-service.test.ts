import { gradeStudentAnswer } from '@/lib/grading-service';
import { getAiProvider, resolveProviderName } from '@/lib/ai';
import { getEffectiveAiConfig } from '@/lib/ai-config';
import { acsTables, insertGradingResult, insertTokenUsage } from '@/lib/db2/acs-repo';
import { incrementNullFallback, insertLocalTokenUsage } from '@/lib/ai-local/acs-local-repo';
import { logAudit } from '@/lib/audit';
import { resolveSystemPromptOverride } from '@/lib/ai-local/prompt';
import { ANALYTIC_INSTRUCTIONS, buildAnalyticSchema } from '@/lib/ai-local/analytic-scoring';
import { GRADING_RESULT_SCHEMA } from '@/lib/ai-local/grading-schema';

jest.mock('@/lib/ai', () => ({ getAiProvider: jest.fn(), resolveProviderName: jest.fn() }));
jest.mock('@/lib/ai-config', () => ({ getEffectiveAiConfig: jest.fn() }));
jest.mock('@/lib/db2/acs-repo', () => ({
  insertGradingResult: jest.fn(),
  insertTokenUsage: jest.fn(),
  acsTables: jest.fn((p: string) => ({
    jobs: p === 'local' ? 'acs_local_grading_jobs' : 'acs_grading_jobs',
    results: p === 'local' ? 'acs_local_grading_results' : 'acs_grading_results',
  })),
}));
jest.mock('@/lib/ai-local/acs-local-repo', () => ({
  incrementNullFallback: jest.fn(), insertLocalTokenUsage: jest.fn(),
}));
jest.mock('@/lib/audit', () => ({ logAudit: jest.fn() }));
jest.mock('@/lib/ai-local/prompt', () => ({
  resolveSystemPromptOverride: jest.fn(() => null),
  sha256Text: jest.fn((text: string) => `sha(${text})`),
}));

const mockRetrieve = jest.fn();
const mockComplete = jest.fn();

const RUBRIC = { max_score: 100, criteria: { akurasi: 60, kelengkapan: 40 }, qualitative_scale: [] };

const PASSAGE = {
  label: 'M1', text: 'Atmosfer berlapis.', locator: 'p. 3',
  documentName: 'geo.pdf', score: 0.8,
};

const MODEL_RESULT = {
  score: 85, max_score: 100, qualitative_grade: 'Good', feedback: 'Bagus.',
  citations: ['M1', 'M7'], confidence: 'high',
  rubric_alignment: { akurasi: 'pass' }, language_detected: 'id', token_usage_estimate: 0,
};

const llmResult = (over: Record<string, unknown> = {}) => ({
  status: 'completed', rawStatus: 'completed', data: { ...MODEL_RESULT },
  rawText: '{}', model: 'qwen2.5:14b-instruct-q4_K_M',
  promptTokens: 900, completionTokens: 120, totalTokens: 1020,
  latencyMs: 11500, loadMs: 4, tokensPerSec: 22.9, ...over,
});

const params = {
  assignmentId: '101', studentId: '59', questionId: '25',
  studentAnswer: 'Atmosfer punya lima lapisan.', rubric: RUBRIC as never,
  groundingRef: 'corpus-1', questionText: 'Jelaskan lapisan atmosfer.',
  jobId: 'job-1', teacherId: '7', teacherName: 'Bu Sri',
};

function useProvider(name: 'openai' | 'local', grounding: unknown) {
  (resolveProviderName as jest.Mock).mockReturnValue(name);
  (getAiProvider as jest.Mock).mockReturnValue({
    name,
    retrieval: { retrieve: mockRetrieve },
    llm: { completeJson: mockComplete },
  });
  mockRetrieve.mockResolvedValue({ grounding, retrievalMs: name === 'local' ? 4 : 0 });
}

let savedScoringMode: string | undefined;
beforeEach(() => {
  savedScoringMode = process.env.LOCAL_SCORING_MODE;
  delete process.env.LOCAL_SCORING_MODE;
});
afterEach(() => {
  if (savedScoringMode === undefined) delete process.env.LOCAL_SCORING_MODE;
  else process.env.LOCAL_SCORING_MODE = savedScoringMode;
});

beforeEach(() => {
  (getEffectiveAiConfig as jest.Mock).mockResolvedValue({
    model: 'gpt-4o-mini', temperature: 0.2, maxTokens: 20000, systemPrompt: 'FROZEN PROMPT',
  });
  mockComplete.mockResolvedValue(llmResult());
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('local provider', () => {
  const grounding = { kind: 'passages', passages: [PASSAGE] };
  beforeEach(() => useProvider('local', grounding));

  it('builds the retrieval query from question, rubric criteria and answer', async () => {
    await gradeStudentAnswer(params);
    expect(mockRetrieve).toHaveBeenCalledWith({
      corpusRef: 'corpus-1',
      queryText: 'Jelaskan lapisan atmosfer.\nakurasi\nkelengkapan\nAtmosfer punya lima lapisan.',
    });
  });

  // The OpenAI path takes citation strings on trust; this one does not.
  it('keeps only citations backed by a retrieved passage', async () => {
    const result = await gradeStudentAnswer(params);
    expect(result?.citations).toEqual(['[geo.pdf_page_3]']);
  });

  it('writes results and metrics to the local tables only', async () => {
    await gradeStudentAnswer(params);

    // Result rows share a shape; only the target table differs.
    expect(insertGradingResult).toHaveBeenCalledWith(
      expect.objectContaining({ assignment_id: '101', score: 85 }),
      { jobs: 'acs_local_grading_jobs', results: 'acs_local_grading_results' }
    );
    expect(acsTables).toHaveBeenCalledWith('local');
    expect(insertLocalTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens_used: 1020, prompt_tokens: 900, completion_tokens: 120,
        latency_ms: 11500, load_ms: 4, retrieval_ms: 4,
      })
    );
    // The frozen OpenAI evidence must never be touched from the local path.
    expect(insertTokenUsage).not.toHaveBeenCalled();
  });

  it('counts a parse failure so a half-failed run cannot look healthy', async () => {
    mockComplete.mockResolvedValue(llmResult({ data: null }));

    const result = await gradeStudentAnswer(params);

    expect(result).toMatchObject({
      score: null,
      feedback: 'Error parsing AI response. Please review manually.',
      confidence: 'low',
      max_score: 100,
    });
    expect(incrementNullFallback).toHaveBeenCalledWith('job-1');
  });

  it('reproduces the documented failure feedback for a non-completed response', async () => {
    mockComplete.mockResolvedValue(
      llmResult({ status: 'incomplete', rawStatus: 'incomplete', data: null, error: 'ran out of room' })
    );

    const result = await gradeStudentAnswer(params);

    expect(result?.feedback).toBe('Grading failed. Status: incomplete. Error: ran out of room');
    expect(incrementNullFallback).toHaveBeenCalled();
  });

  it('says Unknown when the provider gave no error message', async () => {
    mockComplete.mockResolvedValue(llmResult({ status: 'failed', rawStatus: 'failed', data: null }));
    const result = await gradeStudentAnswer(params);
    expect(result?.feedback).toBe('Grading failed. Status: failed. Error: Unknown');
  });

  it('does not count a fallback when there is no job to attribute it to', async () => {
    mockComplete.mockResolvedValue(llmResult({ data: null }));
    await gradeStudentAnswer({ ...params, jobId: undefined });
    expect(incrementNullFallback).not.toHaveBeenCalled();
  });

  it('records local diagnostics in the audit entry', async () => {
    await gradeStudentAnswer(params);
    const details = (logAudit as jest.Mock).mock.calls[0][0].details;
    expect(details).toMatchObject({
      provider: 'local', latency_ms: 11500, load_ms: 4, retrieval_ms: 4,
      passages_retrieved: 1, null_fallback: false, retried_at_zero_temperature: false,
      system_prompt_sha256: 'sha(FROZEN PROMPT)', system_prompt_file: null,
    });
  });

  it('uses the local prompt override and records which file and digest produced the result', async () => {
    (resolveSystemPromptOverride as jest.Mock).mockReturnValueOnce({
      text: 'LOCAL V2', file: 'prompts/local-v2.txt', sha256: 'sha(LOCAL V2)',
    });
    await gradeStudentAnswer(params);

    expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({ system: 'LOCAL V2' }));
    expect((logAudit as jest.Mock).mock.calls[0][0].details).toMatchObject({
      system_prompt_sha256: 'sha(LOCAL V2)', system_prompt_file: 'prompts/local-v2.txt',
    });
  });
});

describe('openai provider', () => {
  const grounding = { kind: 'native', vectorStoreIds: ['vs-1'] };
  beforeEach(() => useProvider('openai', grounding));

  it('hands the vector store to the LLM and writes to the baseline tables', async () => {
    await gradeStudentAnswer({ ...params, groundingRef: 'vs-1' });

    expect(mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'FROZEN PROMPT', grounding, temperature: 0.2, maxTokens: 20000 })
    );
    expect(insertGradingResult).toHaveBeenCalledWith(
      expect.any(Object),
      { jobs: 'acs_grading_jobs', results: 'acs_grading_results' }
    );
    expect(insertTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({ tokens_used: 1020, estimated_cost: 1020 / 1e6 * 10 })
    );
    expect(insertLocalTokenUsage).not.toHaveBeenCalled();
  });

  // Without an override the baseline audit row must stay exactly as before.
  it('records no prompt digest when no override is set', async () => {
    await gradeStudentAnswer({ ...params, groundingRef: 'vs-1' });
    expect(resolveSystemPromptOverride).toHaveBeenCalledWith('openai');
    expect((logAudit as jest.Mock).mock.calls[0][0].details.system_prompt_sha256).toBeUndefined();
  });

  it('uses a shared prompt override and records which file and digest produced the result', async () => {
    (resolveSystemPromptOverride as jest.Mock).mockReturnValueOnce({
      text: 'SHARED V3', file: 'prompts/v3.txt', sha256: 'sha(SHARED V3)',
    });
    await gradeStudentAnswer({ ...params, groundingRef: 'vs-1' });

    expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({ system: 'SHARED V3' }));
    expect((logAudit as jest.Mock).mock.calls[0][0].details).toMatchObject({
      system_prompt_sha256: 'sha(SHARED V3)', system_prompt_file: 'prompts/v3.txt',
    });
  });

  it('leaves the model citations untouched', async () => {
    const result = await gradeStudentAnswer({ ...params, groundingRef: 'vs-1' });
    expect(result?.citations).toEqual(['M1', 'M7']);
  });

  it('skips the token row when the provider reported none', async () => {
    mockComplete.mockResolvedValue(llmResult({ totalTokens: 0 }));
    await gradeStudentAnswer({ ...params, groundingRef: 'vs-1' });
    expect(insertTokenUsage).not.toHaveBeenCalled();
  });

  // getTokenUsageByTeacher() reads details->>'tokens_used'; renaming either key
  // silently zeroes the admin token report.
  it('keeps the tokens_used and model audit keys', async () => {
    await gradeStudentAnswer({ ...params, groundingRef: 'vs-1' });
    const call = (logAudit as jest.Mock).mock.calls[0][0];
    expect(call.action).toBe('ai.grading.call');
    expect(call.details).toMatchObject({
      tokens_used: 1020, model: 'qwen2.5:14b-instruct-q4_K_M', status: 'completed',
    });
    expect(call.details.latency_ms).toBeUndefined();
  });
});

// The model can return a score outside the rubric scale (observed: 130/100 on
// strong agama answers). Stored as-is, a teacher would see 130 out of 100.
describe('score range', () => {
  beforeEach(() => useProvider('local', { kind: 'passages', passages: [PASSAGE] }));

  it.each([
    [130, 100],
    [-5, 0],
  ])('clamps %p into the rubric range and records the original in the audit entry', async (raw, stored) => {
    mockComplete.mockResolvedValue(llmResult({ data: { ...MODEL_RESULT, score: raw } }));
    const result = await gradeStudentAnswer(params);

    expect(result?.score).toBe(stored);
    expect(insertGradingResult).toHaveBeenCalledWith(expect.objectContaining({ score: stored }), expect.any(Object));
    expect((logAudit as jest.Mock).mock.calls[0][0].details.score_clamped_from).toBe(raw);
  });

  it('leaves an in-range score and the audit entry untouched', async () => {
    await gradeStudentAnswer(params);
    expect((logAudit as jest.Mock).mock.calls[0][0].details.score_clamped_from).toBeUndefined();
  });

  it('applies to the openai provider too', async () => {
    useProvider('openai', { kind: 'native', vectorStoreIds: ['vs-1'] });
    mockComplete.mockResolvedValue(llmResult({ data: { ...MODEL_RESULT, score: 101 } }));
    expect((await gradeStudentAnswer({ ...params, groundingRef: 'vs-1' }))?.score).toBe(100);
  });

  it('cannot clamp without a numeric rubric maximum', async () => {
    mockComplete.mockResolvedValue(llmResult({ data: { ...MODEL_RESULT, score: 130 } }));
    const result = await gradeStudentAnswer({ ...params, rubric: { criteria: {} } as never });
    expect(result?.score).toBe(130);
  });
});

describe('analytic scoring mode', () => {
  const grounding = { kind: 'passages', passages: [PASSAGE] };
  const analyticData = (levels: Record<string, string>) => ({
    data: { ...MODEL_RESULT, criterion_levels: levels },
  });

  beforeEach(() => {
    useProvider('local', grounding);
    process.env.LOCAL_SCORING_MODE = 'analytic';
  });

  it('constrains decoding to a level per criterion and appends the instructions after hashing', async () => {
    mockComplete.mockResolvedValue(llmResult(analyticData({ akurasi: 'full', kelengkapan: 'partial' })));
    await gradeStudentAnswer(params);

    const call = mockComplete.mock.calls[0][0];
    expect(call.schema).toEqual(buildAnalyticSchema(['akurasi', 'kelengkapan']));
    expect(call.system).toBe(`FROZEN PROMPT\n\n${ANALYTIC_INSTRUCTIONS(['akurasi', 'kelengkapan'])}`);
    // The digest identifies the base prompt; scoring_mode says the versioned block was added.
    expect((logAudit as jest.Mock).mock.calls[0][0].details.system_prompt_sha256).toBe('sha(FROZEN PROMPT)');
  });

  it('keeps the override digest when a local prompt file is in use', async () => {
    (resolveSystemPromptOverride as jest.Mock).mockReturnValueOnce({
      text: 'LOCAL V2', file: 'prompts/local-v2.txt', sha256: 'sha(LOCAL V2)',
    });
    mockComplete.mockResolvedValue(llmResult(analyticData({ akurasi: 'full', kelengkapan: 'full' })));
    await gradeStudentAnswer(params);

    expect(mockComplete.mock.calls[0][0].system).toMatch(/^LOCAL V2\n\n/);
    expect((logAudit as jest.Mock).mock.calls[0][0].details.system_prompt_sha256).toBe('sha(LOCAL V2)');
  });

  it('computes the score from the rubric weights and keeps the model number in the audit', async () => {
    mockComplete.mockResolvedValue(llmResult(analyticData({ akurasi: 'full', kelengkapan: 'partial' })));
    const result = await gradeStudentAnswer(params);

    // (60*1 + 40*0.6) / 100 * 100
    expect(result?.score).toBe(84);
    expect(insertGradingResult).toHaveBeenCalledWith(expect.objectContaining({ score: 84 }), expect.any(Object));
    expect((logAudit as jest.Mock).mock.calls[0][0].details).toMatchObject({
      scoring_mode: 'analytic',
      model_score: 85,
      criterion_levels: { akurasi: 'full', kelengkapan: 'partial' },
    });
    expect((logAudit as jest.Mock).mock.calls[0][0].details.analytic_fallback).toBeUndefined();
  });

  // Observed: the model declared max_score 50 while the computed score was on the
  // rubric's 0-100 scale, so score/max_score read as 30/50 = 60% instead of 30%.
  it('reports the rubric maximum alongside a computed score', async () => {
    mockComplete.mockResolvedValue(
      llmResult({ data: { ...MODEL_RESULT, max_score: 50, criterion_levels: { akurasi: 'none', kelengkapan: 'full' } } })
    );
    const result = await gradeStudentAnswer(params);

    expect(result).toMatchObject({ score: 40, max_score: 100 });
    expect(insertGradingResult).toHaveBeenCalledWith(
      expect.objectContaining({ score: 40, max_score: 100 }),
      expect.any(Object)
    );
  });

  it('never stores or returns criterion_levels', async () => {
    mockComplete.mockResolvedValue(llmResult(analyticData({ akurasi: 'none', kelengkapan: 'minimal' })));
    const result = await gradeStudentAnswer(params);

    expect(result).not.toHaveProperty('criterion_levels');
    expect((insertGradingResult as jest.Mock).mock.calls[0][0]).not.toHaveProperty('criterion_levels');
    expect(result?.score).toBe(12);
  });

  it('falls back to the model score and flags it when a level is missing', async () => {
    mockComplete.mockResolvedValue(llmResult(analyticData({ akurasi: 'full' })));
    const result = await gradeStudentAnswer(params);

    expect(result?.score).toBe(85);
    expect(result).not.toHaveProperty('criterion_levels');
    const details = (logAudit as jest.Mock).mock.calls[0][0].details;
    expect(details).toMatchObject({ scoring_mode: 'analytic', analytic_fallback: true, criterion_levels: { akurasi: 'full' } });
    expect(details.model_score).toBeUndefined();
  });

  it('still clamps an out-of-range model score on fallback', async () => {
    mockComplete.mockResolvedValue(llmResult({ data: { ...MODEL_RESULT, score: 130 } }));
    const result = await gradeStudentAnswer(params);

    expect(result?.score).toBe(100);
    expect((logAudit as jest.Mock).mock.calls[0][0].details).toMatchObject({
      analytic_fallback: true, criterion_levels: null, score_clamped_from: 130,
    });
  });

  it('does not touch a null fallback result', async () => {
    mockComplete.mockResolvedValue(llmResult({ data: null }));
    const result = await gradeStudentAnswer(params);

    expect(result?.score).toBeNull();
    const details = (logAudit as jest.Mock).mock.calls[0][0].details;
    expect(details).toMatchObject({ scoring_mode: 'analytic', null_fallback: true, criterion_levels: null });
    expect(details.analytic_fallback).toBeUndefined();
  });

  it.each([
    ['empty criteria', { max_score: 100, criteria: {}, qualitative_scale: [] }],
    ['no criteria', { max_score: 100, qualitative_scale: [] }],
  ])('behaves holistically for a rubric with %s', async (_label, rubric) => {
    const result = await gradeStudentAnswer({ ...params, rubric: rubric as never });

    const call = mockComplete.mock.calls[0][0];
    expect(call.schema).toBe(GRADING_RESULT_SCHEMA);
    expect(call.system).toBe('FROZEN PROMPT');
    expect(result?.score).toBe(85);
    expect((logAudit as jest.Mock).mock.calls[0][0].details).toMatchObject({
      scoring_mode: 'holistic', criterion_levels: null,
    });
  });

  it('is holistic by default, with the base schema and prompt unchanged', async () => {
    delete process.env.LOCAL_SCORING_MODE;
    const result = await gradeStudentAnswer(params);

    const call = mockComplete.mock.calls[0][0];
    expect(call.schema).toBe(GRADING_RESULT_SCHEMA);
    expect(call.system).toBe('FROZEN PROMPT');
    expect(result?.score).toBe(85);
    const details = (logAudit as jest.Mock).mock.calls[0][0].details;
    expect(details).toMatchObject({ scoring_mode: 'holistic', criterion_levels: null });
    expect(details.model_score).toBeUndefined();
    expect(details.analytic_fallback).toBeUndefined();
  });

  it('is ignored by the openai provider', async () => {
    useProvider('openai', { kind: 'native', vectorStoreIds: ['vs-1'] });
    const result = await gradeStudentAnswer({ ...params, groundingRef: 'vs-1' });

    const call = mockComplete.mock.calls[0][0];
    expect(call.schema).toBe(GRADING_RESULT_SCHEMA);
    expect(call.system).toBe('FROZEN PROMPT');
    expect(result?.score).toBe(85);
    const details = (logAudit as jest.Mock).mock.calls[0][0].details;
    expect(details.scoring_mode).toBeUndefined();
    expect(details.criterion_levels).toBeUndefined();
  });

  it('is not even resolved by the openai provider, so a bad value cannot break the baseline', async () => {
    process.env.LOCAL_SCORING_MODE = 'bogus';
    useProvider('openai', { kind: 'native', vectorStoreIds: ['vs-1'] });
    await expect(gradeStudentAnswer({ ...params, groundingRef: 'vs-1' })).resolves.toBeDefined();
  });
});

describe('failures', () => {
  it('rethrows after logging when the provider throws', async () => {
    useProvider('local', { kind: 'passages', passages: [] });
    mockComplete.mockRejectedValue(new Error('ollama down'));
    await expect(gradeStudentAnswer(params)).rejects.toThrow('ollama down');
  });

  it('tolerates a rubric with no criteria when building the query', async () => {
    useProvider('local', { kind: 'passages', passages: [] });
    await gradeStudentAnswer({ ...params, rubric: { max_score: 10 } as never, questionText: undefined });
    expect(mockRetrieve).toHaveBeenCalledWith({
      corpusRef: 'corpus-1', queryText: 'Atmosfer punya lima lapisan.',
    });
  });
});
