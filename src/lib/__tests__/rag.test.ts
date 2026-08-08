// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cosineSimilarity, stripHtml, selectRelevantContext, type RagCandidate } from '../rag.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('returns 0 when either vector is a zero-vector', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2], [0, 0])).toBe(0);
  });
});

describe('stripHtml', () => {
  it('removes tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hello <b>world</b>.</p>')).toBe('Hello world .');
  });
});

const CANDIDATES: RagCandidate[] = [
  { pageId: 1, title: 'Golden Gate Bridge', extract: '<p>A famous suspension bridge.</p>', category: 'transport' },
  { pageId: 2, title: 'City Museum', extract: '<p>A museum of local history.</p>', category: 'museum' },
];

function mockEmbedResponse(embeddings: number[][]) {
  return { ok: true, json: async () => ({ embeddings }) };
}

describe('selectRelevantContext', () => {
  it('returns null when candidates is empty', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const result = await selectRelevantContext('bridges', []);
    expect(result).toBeNull();
  });

  it('calls the Ollama embed endpoint with candidate texts plus the query', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      mockEmbedResponse([[1, 0], [0, 1], [1, 0]])
    );
    vi.stubGlobal('fetch', fetchMock);

    await selectRelevantContext('tell me about the bridge', CANDIDATES);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/embed');
    const body = JSON.parse(options.body as string);
    expect(body.model).toBe('nomic-embed-text');
    expect(body.input).toEqual([
      'Golden Gate Bridge. A famous suspension bridge.',
      'City Museum. A museum of local history.',
      'tell me about the bridge',
    ]);
  });

  it('ranks candidates by similarity to the query and returns the closest match first', async () => {
    // Query embedding [1, 0] is identical to candidate 1 (bridge), orthogonal to candidate 2 (museum).
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(mockEmbedResponse([[1, 0], [0, 1], [1, 0]]))
    );

    const result = await selectRelevantContext('tell me about the bridge', CANDIDATES);
    expect(result).not.toBeNull();
    expect(result![0].pageId).toBe(1);
  });

  it('filters out candidates below the similarity threshold', async () => {
    // Both candidates orthogonal to the query -> similarity 0, below threshold.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(mockEmbedResponse([[1, 0], [1, 0], [0, 1]]))
    );

    const result = await selectRelevantContext('something unrelated', CANDIDATES);
    expect(result).toBeNull();
  });

  it('returns null when the embed request is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false }));
    const result = await selectRelevantContext('query', CANDIDATES);
    expect(result).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('connection refused')));
    const result = await selectRelevantContext('query', CANDIDATES);
    expect(result).toBeNull();
  });

  it('returns null when the embeddings array length does not match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(mockEmbedResponse([[1, 0]])));
    const result = await selectRelevantContext('query', CANDIDATES);
    expect(result).toBeNull();
  });
});
