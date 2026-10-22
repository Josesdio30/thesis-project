import { localRetrieve } from '@/lib/ai-local/retrieval';
import { localEmbed } from '@/lib/ai-local/embeddings';
import { searchCorpus } from '@/lib/ai-local/rag/repo';
import { refreshLocalAiConfig } from '@/lib/ai-local/config-repo';
import { setCachedLocalAiConfigRow, type LocalAiConfigRow } from '@/lib/ai-local/config';

jest.mock('@/lib/ai-local/embeddings', () => ({ localEmbed: jest.fn() }));
jest.mock('@/lib/ai-local/rag/repo', () => ({ searchCorpus: jest.fn() }));

const mockEmbed = localEmbed as jest.MockedFunction<typeof localEmbed>;
const mockSearch = searchCorpus as jest.MockedFunction<typeof searchCorpus>;
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

beforeEach(() => {
  mockEmbed.mockResolvedValue({ vectors: [[0.1, 0.2]], totalTokens: 3, model: 'bge-m3', dims: 1024 });
  mockSearch.mockResolvedValue([
    { chunk_id: 'k1', content: 'Lapisan troposfer', locator: 'p. 3', file_name: 'geo.pdf', similarity: 0.81 },
    { chunk_id: 'k2', content: 'Lapisan stratosfer', locator: 'slide 4', file_name: 'geo.pptx', similarity: 0.74 },
  ] as never);
});

describe('localRetrieve', () => {
  it('warms the DB config cache before resolving topK', async () => {
    warmWith({ retrieval_top_k: 3 });
    await localRetrieve({ corpusRef: 'c1', queryText: 'x' });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith('c1', [0.1, 0.2], 3);
  });

  it('labels passages M1..Mk in rank order', async () => {
    const result = await localRetrieve({ corpusRef: 'c1', queryText: 'atmosfer' });

    expect(result.grounding).toEqual({
      kind: 'passages',
      passages: [
        { label: 'M1', text: 'Lapisan troposfer', locator: 'p. 3', documentName: 'geo.pdf', score: 0.81 },
        { label: 'M2', text: 'Lapisan stratosfer', locator: 'slide 4', documentName: 'geo.pptx', score: 0.74 },
      ],
    });
    expect(typeof result.retrievalMs).toBe('number');
  });

  it('defaults topK to the configured value and honours an override', async () => {
    await localRetrieve({ corpusRef: 'c1', queryText: 'x' });
    expect(mockSearch).toHaveBeenCalledWith('c1', [0.1, 0.2], 6);

    await localRetrieve({ corpusRef: 'c1', queryText: 'x', topK: 2 });
    expect(mockSearch).toHaveBeenLastCalledWith('c1', [0.1, 0.2], 2);
  });

  // A long student answer would otherwise dominate the query vector.
  it('truncates the query to 2000 characters', async () => {
    await localRetrieve({ corpusRef: 'c1', queryText: 'a'.repeat(2500) });
    expect(mockEmbed).toHaveBeenCalledWith(['a'.repeat(2000)]);
  });

  it('returns no passages for a blank query without embedding it', async () => {
    const result = await localRetrieve({ corpusRef: 'c1', queryText: '   ' });
    expect(result.grounding).toEqual({ kind: 'passages', passages: [] });
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('coerces a numeric-string similarity from pg', async () => {
    mockSearch.mockResolvedValue([
      { chunk_id: 'k1', content: 'c', locator: 'p. 1', file_name: 'f.pdf', similarity: '0.5' },
    ] as never);
    const result = await localRetrieve({ corpusRef: 'c1', queryText: 'x' });
    const passages = (result.grounding as { passages: { score: number }[] }).passages;
    expect(passages[0].score).toBe(0.5);
  });
});
