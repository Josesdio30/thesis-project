import {
  resolveLocalAiConfig, resolveLocalAiConfigSources, setCachedLocalAiConfigRow, getCachedLocalAiConfigRow,
  LOCAL_AI_DEFAULTS,
} from '@/lib/ai-local/config';

const LOCAL_ENV_KEYS = [
  'OLLAMA_BASE_URL', 'OLLAMA_CHAT_MODEL', 'OLLAMA_EMBED_MODEL', 'OLLAMA_EMBED_DIMS',
  'OLLAMA_NUM_CTX', 'OLLAMA_NUM_PREDICT', 'OLLAMA_KEEP_ALIVE', 'LOCAL_RAG_TOP_K',
  'LOCAL_LLM_CONCURRENCY', 'LOCAL_EMBED_CONCURRENCY', 'LOCAL_SCORING_MODE', 'OLLAMA_THINK',
];

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const key of LOCAL_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});
afterEach(() => {
  for (const key of LOCAL_ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  // The cached row is module state; a leak would make later tests order-dependent.
  setCachedLocalAiConfigRow(null);
});

describe('resolveLocalAiConfig', () => {
  it('falls back to the documented defaults', () => {
    expect(resolveLocalAiConfig()).toEqual(LOCAL_AI_DEFAULTS);
  });

  it('uses the DB row when no env var is set', () => {
    const config = resolveLocalAiConfig({ chat_model: 'qwen2.5:7b', embed_dims: 768 });
    expect(config.chatModel).toBe('qwen2.5:7b');
    expect(config.embedDims).toBe(768);
    expect(config.embedModel).toBe(LOCAL_AI_DEFAULTS.embedModel);
  });

  // Inverted precedence vs `ai_config` on purpose: the validation harness must
  // sweep models via env alone, without writing to shared admin state.
  it('lets env override the DB row', () => {
    process.env.OLLAMA_CHAT_MODEL = 'from-env';
    process.env.OLLAMA_NUM_CTX = '4096';
    const config = resolveLocalAiConfig({ chat_model: 'from-db', num_ctx: 8192 });
    expect(config.chatModel).toBe('from-env');
    expect(config.numCtx).toBe(4096);
  });

  it('ignores blank env values and null row values', () => {
    process.env.OLLAMA_CHAT_MODEL = '   ';
    process.env.OLLAMA_NUM_CTX = '';
    const config = resolveLocalAiConfig({ chat_model: null, num_ctx: null });
    expect(config.chatModel).toBe(LOCAL_AI_DEFAULTS.chatModel);
    expect(config.numCtx).toBe(LOCAL_AI_DEFAULTS.numCtx);
  });

  it('strips trailing slashes from the base URL', () => {
    process.env.OLLAMA_BASE_URL = 'http://host:11434//';
    expect(resolveLocalAiConfig().baseUrl).toBe('http://host:11434');
  });

  it.each(['0', '-1', 'abc', '1.5'])('rejects the non-positive-integer value %p', raw => {
    process.env.OLLAMA_NUM_CTX = raw;
    expect(() => resolveLocalAiConfig()).toThrow(/OLLAMA_NUM_CTX must be a positive integer/);
  });
});

describe('scoringMode', () => {
  it('defaults to holistic', () => {
    expect(resolveLocalAiConfig().scoringMode).toBe('holistic');
  });

  it.each(['holistic', 'analytic', ' analytic '])('accepts %p from env', raw => {
    process.env.LOCAL_SCORING_MODE = raw;
    expect(resolveLocalAiConfig().scoringMode).toBe(raw.trim());
    expect(resolveLocalAiConfigSources().scoringMode).toBe('env');
  });

  it('treats a blank value as unset', () => {
    process.env.LOCAL_SCORING_MODE = '  ';
    expect(resolveLocalAiConfig().scoringMode).toBe('holistic');
    expect(resolveLocalAiConfigSources().scoringMode).toBe('default');
  });

  // A typo silently falling back to holistic would mislabel a whole study run.
  it.each(['Analytic', 'rubric', '1'])('rejects the unknown mode %p', raw => {
    process.env.LOCAL_SCORING_MODE = raw;
    expect(() => resolveLocalAiConfig()).toThrow(/LOCAL_SCORING_MODE must be one of holistic, analytic/);
    expect(() => resolveLocalAiConfigSources()).toThrow(/LOCAL_SCORING_MODE/);
  });
});

describe('think', () => {
  it('is null by default so no think flag is sent', () => {
    expect(resolveLocalAiConfig(null).think).toBeNull();
    expect(resolveLocalAiConfigSources(null).think).toBe('default');
  });

  it.each([
    ['false', false],
    ['FALSE', false],
    ['0', false],
    ['true', true],
    [' 1 ', true],
  ])('reads OLLAMA_THINK=%p as %p', (raw, expected) => {
    process.env.OLLAMA_THINK = raw;
    expect(resolveLocalAiConfig(null).think).toBe(expected);
    expect(resolveLocalAiConfigSources(null).think).toBe('env');
  });

  it('treats a blank value as unset and rejects anything else', () => {
    process.env.OLLAMA_THINK = '  ';
    expect(resolveLocalAiConfig(null).think).toBeNull();
    process.env.OLLAMA_THINK = 'maybe';
    expect(() => resolveLocalAiConfig(null)).toThrow(/OLLAMA_THINK must be true or false/);
  });
});

describe('cached row', () => {
  it('starts empty', () => {
    expect(getCachedLocalAiConfigRow()).toBeNull();
  });

  it('is used by a call without an argument', () => {
    setCachedLocalAiConfigRow({ chat_model: 'cached-model', retrieval_top_k: 9 });
    expect(getCachedLocalAiConfigRow()).toEqual({ chat_model: 'cached-model', retrieval_top_k: 9 });
    const config = resolveLocalAiConfig();
    expect(config.chatModel).toBe('cached-model');
    expect(config.retrievalTopK).toBe(9);
  });

  it('is bypassed by an explicit row, and an explicit null means defaults', () => {
    setCachedLocalAiConfigRow({ chat_model: 'cached-model' });
    expect(resolveLocalAiConfig({ chat_model: 'explicit' }).chatModel).toBe('explicit');
    expect(resolveLocalAiConfig(null).chatModel).toBe(LOCAL_AI_DEFAULTS.chatModel);
  });

  it('still loses to env', () => {
    setCachedLocalAiConfigRow({ chat_model: 'cached-model' });
    process.env.OLLAMA_CHAT_MODEL = 'from-env';
    expect(resolveLocalAiConfig().chatModel).toBe('from-env');
  });
});

describe('resolveLocalAiConfigSources', () => {
  it('reports default for everything with no env and no row', () => {
    const sources = resolveLocalAiConfigSources();
    expect(Object.keys(sources).sort()).toEqual(Object.keys(LOCAL_AI_DEFAULTS).sort());
    expect(new Set(Object.values(sources))).toEqual(new Set(['default']));
  });

  it('attributes each key to env, db or default with env winning', () => {
    process.env.OLLAMA_CHAT_MODEL = 'from-env';
    process.env.LOCAL_LLM_CONCURRENCY = '3';
    const sources = resolveLocalAiConfigSources({ chat_model: 'from-db', embed_dims: 768, num_ctx: null });
    expect(sources).toEqual({
      baseUrl: 'default',
      chatModel: 'env',
      embedModel: 'default',
      embedDims: 'db',
      numCtx: 'default',
      numPredict: 'default',
      keepAlive: 'default',
      retrievalTopK: 'default',
      llmConcurrency: 'env',
      embedConcurrency: 'default',
      scoringMode: 'default',
      think: 'default',
    });
  });

  it('reads the cached row by default', () => {
    setCachedLocalAiConfigRow({ base_url: 'http://gpu:11434', keep_alive: '5m', retrieval_top_k: 4 });
    process.env.OLLAMA_NUM_PREDICT = '512';
    const sources = resolveLocalAiConfigSources();
    expect(sources.baseUrl).toBe('db');
    expect(sources.keepAlive).toBe('db');
    expect(sources.retrievalTopK).toBe('db');
    expect(sources.numPredict).toBe('env');
  });

  it('agrees with resolveLocalAiConfig on every key', () => {
    process.env.OLLAMA_EMBED_MODEL = 'nomic-embed-text';
    process.env.LOCAL_EMBED_CONCURRENCY = '4';
    process.env.LOCAL_SCORING_MODE = 'analytic';
    const row = { embed_model: 'db-embed', num_predict: 700, chat_model: 'db-chat' };
    const config = resolveLocalAiConfig(row);
    const sources = resolveLocalAiConfigSources(row);
    for (const key of Object.keys(LOCAL_AI_DEFAULTS) as (keyof typeof LOCAL_AI_DEFAULTS)[]) {
      if (sources[key] === 'default') expect(config[key]).toBe(LOCAL_AI_DEFAULTS[key]);
      else expect(config[key]).not.toBe(LOCAL_AI_DEFAULTS[key]);
    }
  });
});
