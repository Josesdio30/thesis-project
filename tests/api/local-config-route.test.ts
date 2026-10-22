import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { preflight } from '@/lib/ai-local/ollama-client';
import { refreshLocalAiConfig, updateLocalAiConfig } from '@/lib/ai-local/config-repo';
import type { LocalAiConfigRow } from '@/lib/ai-local/config';
import { logAudit } from '@/lib/audit';
import { GET, PUT } from '@/app/api/admin/ai/local-config/route';

jest.mock('@/lib/auth/require-admin', () => ({ requireAdmin: jest.fn() }));
jest.mock('@/lib/ai', () => ({ resolveProviderName: jest.fn(() => 'local') }));
jest.mock('@/lib/ai-local/ollama-client', () => ({ preflight: jest.fn() }));
jest.mock('@/lib/ai-local/config-repo', () => ({
  refreshLocalAiConfig: jest.fn(),
  updateLocalAiConfig: jest.fn(),
}));
jest.mock('@/lib/audit', () => ({ logAudit: jest.fn() }));

const mockAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockPreflight = preflight as jest.MockedFunction<typeof preflight>;
const mockRefresh = refreshLocalAiConfig as jest.MockedFunction<typeof refreshLocalAiConfig>;
const mockUpdate = updateLocalAiConfig as jest.MockedFunction<typeof updateLocalAiConfig>;
const mockAudit = logAudit as jest.MockedFunction<typeof logAudit>;

const ENV_KEYS = [
  'OLLAMA_BASE_URL',
  'OLLAMA_CHAT_MODEL',
  'OLLAMA_EMBED_MODEL',
  'OLLAMA_EMBED_DIMS',
  'OLLAMA_NUM_CTX',
  'OLLAMA_NUM_PREDICT',
  'OLLAMA_KEEP_ALIVE',
  'LOCAL_RAG_TOP_K',
  'LOCAL_LLM_CONCURRENCY',
  'LOCAL_EMBED_CONCURRENCY',
  'LOCAL_SCORING_MODE',
];
const savedEnv: Record<string, string | undefined> = {};

const UPDATED_AT = '2026-10-16T10:00:00.000Z';
const baseRow: LocalAiConfigRow = {
  base_url: 'http://localhost:11434',
  chat_model: 'qwen2.5:14b-instruct-q4_K_M',
  embed_model: 'bge-m3',
  embed_dims: 1024,
  num_ctx: 8192,
  num_predict: 1536,
  keep_alive: '30m',
  retrieval_top_k: 6,
  updated_at: UPDATED_AT,
};

function putRequest(body: unknown, raw = false): NextRequest {
  return new NextRequest('http://localhost/api/admin/ai/local-config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  mockAdmin.mockResolvedValue({ ok: true, user: { id: '7', name: 'Admin' } });
  mockRefresh.mockResolvedValue({ ...baseRow });
  mockUpdate.mockImplementation(async patch => ({ ...baseRow, ...patch }));
  mockPreflight.mockResolvedValue({
    reachable: true,
    baseUrl: 'http://localhost:11434',
    installedModels: ['llama3.1:8b', 'bge-m3:latest'],
    missingModels: [],
  });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('GET /api/admin/ai/local-config', () => {
  it('returns provider, effective values, sources, env var names and updated_at', async () => {
    process.env.OLLAMA_NUM_CTX = '16384';

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockRefresh).toHaveBeenCalledWith({ force: true });
    expect(body.success).toBe(true);
    expect(body.data.provider).toBe('local');
    expect(body.data.effective).toMatchObject({ chatModel: 'qwen2.5:14b-instruct-q4_K_M', numCtx: 16384 });
    expect(body.data.sources).toMatchObject({ chatModel: 'db', numCtx: 'env', llmConcurrency: 'default' });
    expect(body.data.envVars).toMatchObject({
      baseUrl: 'OLLAMA_BASE_URL',
      chatModel: 'OLLAMA_CHAT_MODEL',
      embedModel: 'OLLAMA_EMBED_MODEL',
      embedDims: 'OLLAMA_EMBED_DIMS',
      numCtx: 'OLLAMA_NUM_CTX',
      numPredict: 'OLLAMA_NUM_PREDICT',
      keepAlive: 'OLLAMA_KEEP_ALIVE',
      retrievalTopK: 'LOCAL_RAG_TOP_K',
      llmConcurrency: 'LOCAL_LLM_CONCURRENCY',
      embedConcurrency: 'LOCAL_EMBED_CONCURRENCY',
      scoringMode: 'LOCAL_SCORING_MODE',
    });
    expect(body.data.updated_at).toBe(UPDATED_AT);
  });

  it('reports an env-set scoring mode', async () => {
    process.env.LOCAL_SCORING_MODE = 'analytic';

    const body = await (await GET()).json();

    expect(body.data.effective.scoringMode).toBe('analytic');
    expect(body.data.sources.scoringMode).toBe('env');
  });

  it('reports defaults and a null updated_at when no row is readable', async () => {
    mockRefresh.mockResolvedValue(null);

    const body = await (await GET()).json();

    expect(body.data.sources.chatModel).toBe('default');
    expect(body.data.updated_at).toBeNull();
  });

  it.each([401, 403])('rejects a non-admin with %s before reading config', async status => {
    mockAdmin.mockResolvedValue({ ok: false, response: NextResponse.json({ success: false }, { status }) });

    const response = await GET();

    expect(response.status).toBe(status);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe('PUT /api/admin/ai/local-config', () => {
  it.each([401, 403])('rejects a non-admin with %s before writing', async status => {
    mockAdmin.mockResolvedValue({ ok: false, response: NextResponse.json({ success: false }, { status }) });

    const response = await PUT(putRequest({ num_ctx: 4096 }));

    expect(response.status).toBe(status);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    const response = await PUT(putRequest('{not json', true));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ success: false, error: 'Invalid JSON body' });
  });

  it.each([null, [], 'num_ctx', 42])('rejects a non-object body (%p)', async payload => {
    const response = await PUT(putRequest(payload));

    expect(response.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects an empty patch', async () => {
    const response = await PUT(putRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/no fields/i);
  });

  it('rejects unknown keys', async () => {
    const response = await PUT(putRequest({ num_ctx: 4096, temperature: 0.2 }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('temperature');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it.each(['embed_model', 'embed_dims'])('rejects %s with a re-index explanation', async field => {
    const response = await PUT(putRequest({ [field]: field === 'embed_dims' ? 768 : 'nomic-embed-text' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain(field);
    expect(body.error).toMatch(/VECTOR\(1024\)/);
    expect(body.error).toMatch(/re-index/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  const invalid: [string, unknown][] = [
    ['base_url', 'ftp://gpu:11434'],
    ['base_url', 'not a url'],
    ['base_url', 42],
    ['chat_model', ''],
    ['chat_model', '   '],
    ['chat_model', 'a'.repeat(201)],
    ['chat_model', 'qwen2.5; rm -rf /'],
    ['chat_model', 7],
    ['num_ctx', 511],
    ['num_ctx', 131073],
    ['num_ctx', 4096.5],
    ['num_ctx', '4096'],
    ['num_predict', 63],
    ['num_predict', 32769],
    ['num_predict', 100.5],
    ['keep_alive', '15'],
    ['keep_alive', '5d'],
    ['keep_alive', '-2'],
    ['keep_alive', 30],
    ['retrieval_top_k', 0],
    ['retrieval_top_k', 21],
    ['retrieval_top_k', 2.5],
  ];

  it.each(invalid)('rejects an invalid %s (%p) without echoing the value', async (field, value) => {
    const response = await PUT(putRequest({ [field]: value }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain(field);
    if (typeof value === 'string' && value.trim() !== '') expect(body.error).not.toContain(value);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects num_predict that is not below the current num_ctx', async () => {
    const response = await PUT(putRequest({ num_predict: 8192 }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/num_predict must be less than num_ctx/);
  });

  it('rejects num_ctx that drops below the current num_predict', async () => {
    const response = await PUT(putRequest({ num_ctx: 1024 }));

    expect(response.status).toBe(400);
  });

  it('checks num_predict against the num_ctx in the same patch', async () => {
    const response = await PUT(putRequest({ num_ctx: 16384, num_predict: 8192 }));

    expect(response.status).toBe(200);
  });

  it('checks num_predict against an env-overridden num_ctx', async () => {
    process.env.OLLAMA_NUM_CTX = '2048';

    const response = await PUT(putRequest({ num_predict: 4096 }));

    expect(response.status).toBe(400);
  });

  it('saves a valid patch, strips trailing slashes and audits the change', async () => {
    const response = await PUT(
      putRequest({ base_url: 'https://gpu.lan:11434///', keep_alive: '-1', retrieval_top_k: 8, num_ctx: 16384 })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      base_url: 'https://gpu.lan:11434',
      keep_alive: '-1',
      retrieval_top_k: 8,
      num_ctx: 16384,
    });
    expect(mockAudit).toHaveBeenCalledWith({
      actorUserId: '7',
      actorName: 'Admin',
      action: 'ai.local_config.update',
      entityType: 'local_ai_config',
      entityId: '1',
      details: { base_url: 'https://gpu.lan:11434', keep_alive: '-1', retrieval_top_k: 8, num_ctx: 16384 },
    });
    expect(body.success).toBe(true);
    expect(body.data.effective).toMatchObject({ baseUrl: 'https://gpu.lan:11434', retrievalTopK: 8, numCtx: 16384 });
    expect(body.data.warnings).toEqual([]);
    expect(body.data.updated_at).toBe(UPDATED_AT);
    expect(mockPreflight).not.toHaveBeenCalled();
  });

  it('accepts the boundary values', async () => {
    const response = await PUT(
      putRequest({ num_ctx: 131072, num_predict: 32768, retrieval_top_k: 20, keep_alive: '0' })
    );

    expect(response.status).toBe(200);
  });

  it('trims a chat_model and accepts an Ollama namespace/tag', async () => {
    mockPreflight.mockResolvedValue({
      reachable: true,
      baseUrl: 'http://localhost:11434',
      installedModels: ['library/llama3.1:8b'],
      missingModels: [],
    });

    const response = await PUT(putRequest({ chat_model: '  library/llama3.1:8b ' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ chat_model: 'library/llama3.1:8b' });
    expect(mockPreflight).toHaveBeenCalledWith(
      ['library/llama3.1:8b'],
      expect.objectContaining({ baseUrl: 'http://localhost:11434' })
    );
    expect(body.data.warnings).toEqual([]);
  });

  it('warns for every saved field that an env var still overrides', async () => {
    process.env.OLLAMA_KEEP_ALIVE = '5m';
    process.env.LOCAL_RAG_TOP_K = '4';

    const response = await PUT(putRequest({ keep_alive: '1h', retrieval_top_k: 10, base_url: 'http://gpu:11434' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.warnings).toEqual([
      'OLLAMA_KEEP_ALIVE is set in the environment and overrides this value',
      'LOCAL_RAG_TOP_K is set in the environment and overrides this value',
    ]);
    expect(body.data.sources).toMatchObject({ keepAlive: 'env', retrievalTopK: 'env', baseUrl: 'db' });
  });

  it('warns, without failing, when the new chat model is not pulled', async () => {
    mockPreflight.mockResolvedValue({
      reachable: true,
      baseUrl: 'http://localhost:11434',
      installedModels: ['bge-m3:latest'],
      missingModels: ['llama3.1:8b'],
    });

    const response = await PUT(putRequest({ chat_model: 'llama3.1:8b' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
    expect(body.data.warnings).toEqual(['llama3.1:8b is not installed in Ollama. Run: ollama pull llama3.1:8b']);
  });

  it('warns, without failing, when Ollama is unreachable', async () => {
    mockPreflight.mockResolvedValue({
      reachable: false,
      baseUrl: 'http://localhost:11434',
      installedModels: [],
      missingModels: ['llama3.1:8b'],
      error: 'fetch failed',
    });

    const response = await PUT(putRequest({ chat_model: 'llama3.1:8b' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.warnings).toEqual([
      'Ollama is not reachable at http://localhost:11434, so llama3.1:8b could not be verified',
    ]);
  });

  it('returns 500 when the row cannot be written', async () => {
    mockUpdate.mockRejectedValue(new Error('local_ai_config row is missing'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await PUT(putRequest({ num_ctx: 4096 }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ success: false, error: 'Failed to save local AI configuration' });
    expect(mockAudit).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
