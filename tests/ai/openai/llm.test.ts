import { openaiCompleteJson, parseJsonLoose, openaiLlmProvider } from '@/lib/ai/openai/llm';
import { getOpenAI } from '@/lib/openai';
import { getEffectiveAiConfig } from '@/lib/ai-config';

const mockResponsesCreate = jest.fn();
jest.mock('@/lib/openai', () => ({ getOpenAI: jest.fn() }));
jest.mock('@/lib/ai-config', () => ({ getEffectiveAiConfig: jest.fn() }));

(getOpenAI as jest.Mock).mockResolvedValue({ responses: { create: mockResponsesCreate } });

const config = { model: 'gpt-4o-mini', temperature: 0.2, maxTokens: null, systemPrompt: 'sp' };

const baseRequest = { system: 'sys', user: 'usr', temperature: 0.2, maxTokens: null };

describe('parseJsonLoose', () => {
  it('parses bare JSON and fenced JSON alike', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('returns null on invalid JSON instead of throwing', () => {
    expect(parseJsonLoose('not json')).toBeNull();
  });
});

describe('openaiCompleteJson', () => {
  beforeEach(() => {
    mockResponsesCreate.mockReset();
    (getEffectiveAiConfig as jest.Mock).mockResolvedValue(config);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('passes native grounding through as the file_search tool', async () => {
    mockResponsesCreate.mockResolvedValue({
      status: 'completed',
      output_text: '{"score":9}',
      usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
    });

    const result = await openaiCompleteJson({
      ...baseRequest,
      grounding: { kind: 'native', vectorStoreIds: ['vs_1'] },
    });

    expect(mockResponsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        instructions: 'sys',
        input: 'usr',
        store: false,
        tools: [{ type: 'file_search', vector_store_ids: ['vs_1'] }],
        text: { format: { type: 'json_object' } },
      })
    );
    expect(result).toMatchObject({
      status: 'completed',
      rawStatus: 'completed',
      data: { score: 9 },
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      loadMs: 0,
      tokensPerSec: 0,
    });
  });

  it('omits tools when there is no grounding and forwards maxTokens', async () => {
    mockResponsesCreate.mockResolvedValue({ status: 'completed', output_text: '{}', usage: null });
    await openaiCompleteJson({ ...baseRequest, maxTokens: 2000 });

    const sent = mockResponsesCreate.mock.calls[0][0];
    expect(sent.tools).toBeUndefined();
    expect(sent.max_output_tokens).toBe(2000);
  });

  // The call completed; only the payload was unusable. Keeping status intact
  // preserves audit comparability, and `data: null` drives the caller's
  // documented null-score fallback.
  it('keeps status "completed" but returns null data on unparseable output', async () => {
    mockResponsesCreate.mockResolvedValue({ status: 'completed', output_text: 'oops', usage: null });
    const result = await openaiCompleteJson(baseRequest);
    expect(result.status).toBe('completed');
    expect(result.data).toBeNull();
    expect(result.totalTokens).toBe(0);
  });

  it('surfaces a failed response with its error message', async () => {
    mockResponsesCreate.mockResolvedValue({
      status: 'failed',
      error: { message: 'rate limited' },
      output_text: 'ignored',
    });
    const result = await openaiCompleteJson(baseRequest);
    expect(result).toMatchObject({ status: 'failed', rawStatus: 'failed', data: null, rawText: '', error: 'rate limited' });
  });

  it('maps an unknown provider status to failed while preserving the raw value', async () => {
    mockResponsesCreate.mockResolvedValue({ status: 'cancelled', output_text: '' });
    const result = await openaiCompleteJson(baseRequest);
    expect(result.status).toBe('failed');
    expect(result.rawStatus).toBe('cancelled');
  });

  it('passes "incomplete" through unchanged', async () => {
    mockResponsesCreate.mockResolvedValue({ status: 'incomplete', output_text: '' });
    await expect(openaiCompleteJson(baseRequest)).resolves.toMatchObject({ status: 'incomplete' });
  });

  it('is wired into the provider bundle', () => {
    expect(openaiLlmProvider.completeJson).toBe(openaiCompleteJson);
  });
});
