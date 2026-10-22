import {
  nsToMs,
  tokensPerSecond,
  ollamaEmbed,
  ollamaChat,
  ollamaTags,
  preflight,
  OllamaError,
} from '@/lib/ai-local/ollama-client';
import { LOCAL_AI_DEFAULTS, type LocalAiConfig } from '@/lib/ai-local/config';

const config: LocalAiConfig = { ...LOCAL_AI_DEFAULTS, baseUrl: 'http://ollama.test:11434' };

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function textResponse(body: string, status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  } as unknown as Response;
}

const lastBody = (mock: jest.Mock, call = 0) => JSON.parse(mock.mock.calls[call][1].body);

describe('duration helpers', () => {
  it('converts Ollama nanoseconds to milliseconds', () => {
    expect(nsToMs(1_500_000)).toBe(1.5);
    expect(nsToMs(undefined)).toBe(0);
    expect(nsToMs(Number.NaN)).toBe(0);
  });

  it('derives tokens/sec from eval count and duration', () => {
    expect(tokensPerSecond(100, 2_000_000_000)).toBe(50);
    expect(tokensPerSecond(0, 1_000)).toBe(0);
    expect(tokensPerSecond(10, undefined)).toBe(0);
  });
});

describe('ollamaEmbed', () => {
  it('posts to /api/embed with truncate disabled', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        model: 'bge-m3',
        embeddings: [[0.1, 0.2]],
        prompt_eval_count: 12,
        total_duration: 2_000_000,
        load_duration: 500_000,
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await ollamaEmbed(['hello'], config);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://ollama.test:11434/api/embed');
    const body = lastBody(fetchMock);
    // Silent truncation would corrupt similarity scores with no trace.
    expect(body.truncate).toBe(false);
    expect(body.input).toEqual(['hello']);
    expect(body.keep_alive).toBe(LOCAL_AI_DEFAULTS.keepAlive);
    expect(result).toEqual({
      vectors: [[0.1, 0.2]],
      model: 'bge-m3',
      promptTokens: 12,
      totalMs: 2,
      loadMs: 0.5,
    });
  });

  it('falls back to configured values when the response omits fields', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({})) as unknown as typeof fetch;
    const result = await ollamaEmbed(['x'], config);
    expect(result.vectors).toEqual([]);
    expect(result.model).toBe(config.embedModel);
    expect(result.promptTokens).toBe(0);
  });
});

describe('ollamaChat', () => {
  const chatBody = {
    model: 'qwen2.5:14b-instruct-q4_K_M',
    message: { role: 'assistant', content: '{"score":80}' },
    done: true,
    done_reason: 'stop',
    prompt_eval_count: 900,
    eval_count: 120,
    eval_duration: 3_000_000_000,
    total_duration: 4_000_000_000,
    load_duration: 0,
  };

  it('sends the JSON schema as `format` for constrained decoding', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(chatBody));
    global.fetch = fetchMock as unknown as typeof fetch;

    const schema = { type: 'object', properties: { score: { type: 'number' } } };
    const result = await ollamaChat(
      { system: 'sys', user: 'usr', schema, temperature: 0.2 },
      config
    );

    const body = lastBody(fetchMock);
    expect(body.format).toEqual(schema);
    expect(body.stream).toBe(false);
    expect(body.options).toEqual({
      temperature: 0.2,
      num_ctx: config.numCtx,
      num_predict: config.numPredict,
      seed: 0,
    });
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ]);
    expect(result.content).toBe('{"score":80}');
    expect(result.truncated).toBe(false);
    expect(result.tokensPerSec).toBe(40);
    expect(result.loadMs).toBe(0);
  });

  // Thinking models (qwen3.5, gemma4) reason before answering unless told not to;
  // older models reject nothing because the field is only sent when configured.
  it('sends `think` only when it is configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(chatBody));
    global.fetch = fetchMock as unknown as typeof fetch;

    await ollamaChat({ system: 's', user: 'u', temperature: 0 }, config);
    expect(lastBody(fetchMock)).not.toHaveProperty('think');

    await ollamaChat({ system: 's', user: 'u', temperature: 0 }, { ...config, think: false });
    expect(lastBody(fetchMock, 1).think).toBe(false);

    await ollamaChat({ system: 's', user: 'u', temperature: 0 }, { ...config, think: true });
    expect(lastBody(fetchMock, 2).think).toBe(true);
  });

  it('omits `format` when no schema is supplied and honours numPredict override', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(chatBody));
    global.fetch = fetchMock as unknown as typeof fetch;

    await ollamaChat({ system: 's', user: 'u', temperature: 0, numPredict: 64 }, config);

    const body = lastBody(fetchMock);
    expect(body.format).toBeUndefined();
    expect(body.options.num_predict).toBe(64);
  });

  // Under schema-constrained decoding a num_predict cut-off severs the object
  // mid-token and is GUARANTEED to fail JSON.parse. Conflating the two makes
  // the real cause undiagnosable.
  it('reports done_reason "length" as truncated rather than a parse failure', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ ...chatBody, done_reason: 'length' })) as unknown as typeof fetch;

    const result = await ollamaChat({ system: 's', user: 'u', temperature: 0 }, config);
    expect(result.truncated).toBe(true);
    expect(result.doneReason).toBe('length');
  });

  it('defaults doneReason to "stop" and content to empty when absent', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({})) as unknown as typeof fetch;
    const result = await ollamaChat({ system: 's', user: 'u', temperature: 0 }, config);
    expect(result.doneReason).toBe('stop');
    expect(result.content).toBe('');
    expect(result.model).toBe(config.chatModel);
    expect(result.tokensPerSec).toBe(0);
  });
});

describe('error handling', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('retries 5xx with exponential backoff and succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(textResponse('overloaded', 503))
      .mockResolvedValueOnce(jsonResponse({ model: 'bge-m3', embeddings: [[1]] }));
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const promise = ollamaEmbed(['x'], config);
    await jest.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toMatchObject({ vectors: [[1]] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry budget is exhausted', async () => {
    const fetchMock = jest.fn().mockResolvedValue(textResponse('boom', 500));
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const promise = ollamaEmbed(['x'], config);
    const assertion = expect(promise).rejects.toThrow(/failed with 500/);
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // A 4xx is a config fault the operator must fix; retrying only delays it.
  it('does not retry 4xx and surfaces the exact `ollama pull` command', async () => {
    const fetchMock = jest.fn().mockResolvedValue(textResponse('model "bge-m3" not found', 404));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(ollamaEmbed(['x'], config)).rejects.toThrow(/ollama pull bge-m3/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a generic 4xx without a pull hint', async () => {
    global.fetch = jest.fn().mockResolvedValue(textResponse('bad request', 400)) as unknown as typeof fetch;
    await expect(ollamaEmbed(['x'], config)).rejects.toThrow(/failed with 400: bad request/);
  });

  it('explains how to start Ollama when the connection is refused', async () => {
    const fetchMock = jest.fn().mockRejectedValue(
      Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const promise = ollamaEmbed(['x'], config);
    const assertion = expect(promise).rejects.toThrow(/Cannot reach Ollama[\s\S]*ollama serve/);
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it('converts an aborted request into a timeout error', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })) as unknown as typeof fetch;

    await expect(ollamaChat({ system: 's', user: 'u', temperature: 0 }, config)).rejects.toThrow(
      /timed out after 300000ms/
    );
  });

  it('detects a refused connection from the message alone', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434')) as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const promise = ollamaEmbed(['x'], config);
    const assertion = expect(promise).rejects.toThrow(/Cannot reach Ollama/);
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it('treats a message-less thrown value as non-retryable', async () => {
    global.fetch = jest.fn().mockRejectedValue({}) as unknown as typeof fetch;
    await expect(ollamaEmbed(['x'], config)).rejects.toEqual({});
  });

  it('rethrows non-network errors untouched', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('bad input')) as unknown as typeof fetch;
    await expect(ollamaEmbed(['x'], config)).rejects.toThrow(TypeError);
  });
});

describe('abort and defensive paths', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** A fetch that never settles until its AbortSignal fires. */
  const abortableFetch = () =>
    jest.fn((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        );
      })
    );

  it('aborts a chat that exceeds the 300s budget', async () => {
    global.fetch = abortableFetch() as unknown as typeof fetch;
    const promise = ollamaChat({ system: 's', user: 'u', temperature: 0 }, config);
    const assertion = expect(promise).rejects.toThrow(/timed out after 300000ms/);
    await jest.advanceTimersByTimeAsync(300_000);
    await assertion;
  });

  it('aborts a /api/tags probe that exceeds 10s', async () => {
    global.fetch = abortableFetch() as unknown as typeof fetch;
    const promise = ollamaTags(config);
    const assertion = expect(promise).rejects.toThrow(/aborted/);
    await jest.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it('still reports the status when the error body cannot be read', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => { throw new Error('stream closed'); },
    }) as unknown as typeof fetch;

    await expect(ollamaEmbed(['x'], config)).rejects.toThrow(/failed with 400: $/);
  });

  it('handles a thrown null without crashing on property access', async () => {
    global.fetch = jest.fn().mockRejectedValue(null) as unknown as typeof fetch;
    await expect(ollamaEmbed(['x'], config)).rejects.toBeNull();
  });

  it.each([
    ['plain string failure', 'plain string failure'],
    [null, 'null'],
  ])('falls back to String(error) when preflight catches %p', async (thrown, expected) => {
    global.fetch = jest.fn().mockRejectedValue(thrown) as unknown as typeof fetch;
    const health = await preflight(['bge-m3'], config);
    expect(health).toMatchObject({ reachable: false, error: expected });
  });
});

describe('default configuration path', () => {
  // Each `config = resolveLocalAiConfig()` default initialiser is only
  // exercised when the argument is omitted, which is how callers use it.
  const saved = process.env.OLLAMA_BASE_URL;
  beforeEach(() => {
    process.env.OLLAMA_BASE_URL = 'http://default.test:11434';
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = saved;
  });

  it('resolves config from the environment when none is passed', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ model: 'bge-m3', embeddings: [[1]] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await ollamaEmbed(['x']);
    await ollamaChat({ system: 's', user: 'u', temperature: 0 });

    expect(fetchMock.mock.calls[0][0]).toBe('http://default.test:11434/api/embed');
    expect(fetchMock.mock.calls[1][0]).toBe('http://default.test:11434/api/chat');
  });

  it('resolves config for tags and preflight too', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ models: [] })) as unknown as typeof fetch;
    await expect(ollamaTags()).resolves.toEqual([]);
    await expect(preflight([])).resolves.toMatchObject({
      reachable: true,
      baseUrl: 'http://default.test:11434',
    });
  });
});

describe('ollamaTags / preflight', () => {
  it('returns installed models', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ models: [{ name: 'bge-m3:latest' }] })) as unknown as typeof fetch;
    await expect(ollamaTags(config)).resolves.toEqual([{ name: 'bge-m3:latest' }]);
  });

  it('returns an empty list when the response has no models key', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({})) as unknown as typeof fetch;
    await expect(ollamaTags(config)).resolves.toEqual([]);
  });

  it('throws an OllamaError on a non-OK /api/tags', async () => {
    global.fetch = jest.fn().mockResolvedValue(textResponse('nope', 500)) as unknown as typeof fetch;
    await expect(ollamaTags(config)).rejects.toBeInstanceOf(OllamaError);
  });

  it('treats "bge-m3" and "bge-m3:latest" as the same model', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ models: [{ name: 'bge-m3:latest' }] })) as unknown as typeof fetch;

    const health = await preflight(['bge-m3', 'qwen2.5:14b-instruct-q4_K_M'], config);
    expect(health.reachable).toBe(true);
    expect(health.missingModels).toEqual(['qwen2.5:14b-instruct-q4_K_M']);
  });

  it('reports every model missing when Ollama is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch;
    const health = await preflight(['bge-m3'], config);
    expect(health).toMatchObject({ reachable: false, missingModels: ['bge-m3'], error: 'down' });
  });
});
