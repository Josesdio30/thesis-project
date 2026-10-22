import { resolveProviderName, getAiProvider } from '@/lib/ai';

describe('resolveProviderName', () => {
  const original = process.env.AI_PROVIDER;
  afterEach(() => {
    if (original === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = original;
  });

  it('defaults to openai when unset, so the baseline path is unchanged', () => {
    delete process.env.AI_PROVIDER;
    expect(resolveProviderName()).toBe('openai');
  });

  it.each([
    ['local', 'local'],
    ['LOCAL', 'local'],
    ['  openai  ', 'openai'],
  ])('normalises %p to %p', (raw, expected) => {
    process.env.AI_PROVIDER = raw;
    expect(resolveProviderName()).toBe(expected);
  });

  // A silent fallback would let a run labelled "local" quietly bill OpenAI.
  it.each(['ollama', '', 'openai-local'])('throws on unrecognised value %p', raw => {
    process.env.AI_PROVIDER = raw;
    expect(() => resolveProviderName()).toThrow(/Invalid AI_PROVIDER/);
  });
});

describe('getAiProvider', () => {
  it('returns the matching provider bundle', () => {
    expect(getAiProvider('openai').name).toBe('openai');
    expect(getAiProvider('local').name).toBe('local');
  });

  it('honours AI_PROVIDER when no name is passed', () => {
    process.env.AI_PROVIDER = 'local';
    expect(getAiProvider().name).toBe('local');
    delete process.env.AI_PROVIDER;
  });

  it('exposes all three seams on both providers', () => {
    for (const name of ['openai', 'local'] as const) {
      const provider = getAiProvider(name);
      expect(typeof provider.embeddings.embed).toBe('function');
      expect(typeof provider.llm.completeJson).toBe('function');
      expect(typeof provider.retrieval.retrieve).toBe('function');
    }
  });
});
