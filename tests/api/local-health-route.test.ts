import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { preflight } from '@/lib/ai-local/ollama-client';
import { refreshLocalAiConfig } from '@/lib/ai-local/config-repo';
import { setCachedLocalAiConfigRow } from '@/lib/ai-local/config';
import { GET } from '@/app/api/admin/ai/local-health/route';

jest.mock('@/lib/auth/require-admin', () => ({ requireAdmin: jest.fn() }));
jest.mock('@/lib/ai', () => ({ resolveProviderName: jest.fn(() => 'local') }));
jest.mock('@/lib/ai-local/ollama-client', () => ({ preflight: jest.fn() }));
jest.mock('@/lib/ai-local/config-repo', () => ({ refreshLocalAiConfig: jest.fn() }));

const mockAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockPreflight = preflight as jest.MockedFunction<typeof preflight>;
const mockRefresh = refreshLocalAiConfig as jest.MockedFunction<typeof refreshLocalAiConfig>;

beforeEach(() => {
  mockAdmin.mockResolvedValue({ ok: true, user: { id: '1', name: 'Admin' } });
  mockPreflight.mockResolvedValue({
    reachable: true,
    baseUrl: 'http://gpu:11434',
    installedModels: [],
    missingModels: [],
  } as never);
});
afterEach(() => setCachedLocalAiConfigRow(null));

describe('GET /api/admin/ai/local-health', () => {
  it('checks the models from the saved DB row, not just the defaults', async () => {
    mockRefresh.mockImplementationOnce(async () => {
      const row = { chat_model: 'llama3.1:8b', embed_model: 'nomic-embed-text', base_url: 'http://gpu:11434' };
      setCachedLocalAiConfigRow(row);
      return row;
    });

    const response = await GET();
    const body = await response.json();

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockPreflight).toHaveBeenCalledWith(
      ['llama3.1:8b', 'nomic-embed-text'],
      expect.objectContaining({ baseUrl: 'http://gpu:11434' })
    );
    expect(body.data).toMatchObject({ chatModel: 'llama3.1:8b', embedModel: 'nomic-embed-text', ready: true });
  });

  it('rejects a non-admin before touching the config', async () => {
    const denied = NextResponse.json({ success: false }, { status: 403 });
    mockAdmin.mockResolvedValue({ ok: false, response: denied });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockPreflight).not.toHaveBeenCalled();
  });
});
