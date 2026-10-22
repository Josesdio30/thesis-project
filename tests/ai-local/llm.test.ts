import { localCompleteJson, buildSystemPrompt, parseJsonLoose } from '@/lib/ai-local/llm';
import { ollamaChat } from '@/lib/ai-local/ollama-client';
import type { LlmRequest } from '@/lib/ai/types';
import { refreshLocalAiConfig } from '@/lib/ai-local/config-repo';
import { setCachedLocalAiConfigRow, type LocalAiConfigRow } from '@/lib/ai-local/config';

jest.mock('@/lib/ai-local/ollama-client', () => ({ ollamaChat: jest.fn() }));
const mockChat = ollamaChat as jest.MockedFunction<typeof ollamaChat>;
// The DB-backed config cache is exercised in config-repo.test.ts; here it only
// has to stay out of the database.
jest.mock('@/lib/ai-local/config-repo', () => ({ refreshLocalAiConfig: jest.fn() }));
const mockRefresh = refreshLocalAiConfig as jest.MockedFunction<typeof refreshLocalAiConfig>;
afterEach(() => setCachedLocalAiConfigRow(null));
const warmWith = (row: LocalAiConfigRow) =>
  mockRefresh.mockImplementationOnce(async () => {
    setCachedLocalAiConfigRow(row);
    return row;
  });

const chatResult = (over: Partial<Awaited<ReturnType<typeof ollamaChat>>> = {}) => ({
  content: '{"score":80}',
  model: 'qwen2.5:14b-instruct-q4_K_M',
  truncated: false,
  doneReason: 'stop',
  promptTokens: 900,
  completionTokens: 120,
  totalMs: 11500,
  loadMs: 0,
  tokensPerSec: 22.9,
  ...over,
});

const request: LlmRequest = {
  system: 'SYSTEM', user: 'USER', temperature: 0.2, maxTokens: 20000,
};

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));

describe('parseJsonLoose', () => {
  it('handles bare and fenced JSON, and returns null otherwise', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('nope')).toBeNull();
  });
});

describe('buildSystemPrompt', () => {
  it('leaves the frozen prompt untouched when grounding is native or absent', () => {
    expect(buildSystemPrompt(request)).toBe('SYSTEM');
    expect(
      buildSystemPrompt({ ...request, grounding: { kind: 'native', vectorStoreIds: ['vs'] } })
    ).toBe('SYSTEM');
  });

  it('appends the retrieved-materials block after the frozen prompt', () => {
    const prompt = buildSystemPrompt({
      ...request,
      grounding: {
        kind: 'passages',
        passages: [{ label: 'M1', text: 'body', locator: 'p. 1', documentName: 'a.pdf', score: 0.8 }],
      },
    });
    expect(prompt.startsWith('SYSTEM')).toBe(true);
    expect(prompt).toContain('[M1] (a.pdf, p. 1)');
  });
});

describe('localCompleteJson', () => {
  it('warms the DB config cache before resolving the config', async () => {
    warmWith({ num_predict: 700, chat_model: 'from-db' });
    mockChat.mockResolvedValue(chatResult());

    await localCompleteJson(request);

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockChat.mock.calls[0][0].numPredict).toBe(700);
    expect(mockChat.mock.calls[0][1]).toMatchObject({ chatModel: 'from-db' });
  });

  it('passes the schema through and reports parsed data with metrics', async () => {
    mockChat.mockResolvedValue(chatResult());

    const result = await localCompleteJson({ ...request, schema: { type: 'object' } });

    expect(mockChat.mock.calls[0][0]).toMatchObject({
      system: 'SYSTEM', user: 'USER', temperature: 0.2, schema: { type: 'object' },
    });
    // config-v1.4's max_tokens of 20000 must NOT become num_predict: under
    // constrained decoding a cut-off guarantees a parse failure.
    expect(mockChat.mock.calls[0][0].numPredict).toBe(1536);
    expect(result).toMatchObject({
      status: 'completed', rawStatus: 'completed', data: { score: 80 },
      promptTokens: 900, completionTokens: 120, totalTokens: 1020,
      latencyMs: 11500, loadMs: 0, tokensPerSec: 22.9,
    });
    expect(result.retriedAtZeroTemperature).toBeUndefined();
  });

  it('reports a num_predict cut-off as incomplete, not as a parse error', async () => {
    mockChat.mockResolvedValue(chatResult({ truncated: true, doneReason: 'length', content: '{"sco' }));

    const result = await localCompleteJson(request);

    expect(result.status).toBe('incomplete');
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/done_reason=length/);
    // No retry: a truncation will truncate again at the same limit.
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it('retries once at temperature 0 and succeeds', async () => {
    mockChat
      .mockResolvedValueOnce(chatResult({ content: 'not json', promptTokens: 900, completionTokens: 50 }))
      .mockResolvedValueOnce(chatResult({ content: '{"score":75}' }));

    const result = await localCompleteJson(request);

    expect(mockChat).toHaveBeenCalledTimes(2);
    expect(mockChat.mock.calls[1][0].temperature).toBe(0);
    expect(result.data).toEqual({ score: 75 });
    expect(result.retriedAtZeroTemperature).toBe(true);
    // Both attempts are real cost and must show up in the metrics.
    expect(result.promptTokens).toBe(1800);
    expect(result.completionTokens).toBe(170);
    expect(result.latencyMs).toBe(23000);
  });

  it('gives up after the retry also fails to parse', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockChat.mockResolvedValue(chatResult({ content: 'still not json' }));

    const result = await localCompleteJson(request);

    expect(mockChat).toHaveBeenCalledTimes(2);
    // The call completed; only the payload was unusable. Keeping the status
    // intact is what drives the caller's documented null-score fallback.
    expect(result.status).toBe('completed');
    expect(result.data).toBeNull();
  });

  it('does not retry when the request was already deterministic', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockChat.mockResolvedValue(chatResult({ content: 'bad' }));

    await localCompleteJson({ ...request, temperature: 0 });

    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it('sums a cold load across attempts so it cannot hide inside latency', async () => {
    mockChat
      .mockResolvedValueOnce(chatResult({ content: 'bad', loadMs: 9540, totalMs: 24700 }))
      .mockResolvedValueOnce(chatResult({ loadMs: 4, totalMs: 11500 }));

    const result = await localCompleteJson(request);

    expect(result.loadMs).toBe(9544);
    expect(result.latencyMs).toBe(36200);
  });
});
