// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockRedis = {
  get: vi.fn<[key: string], Promise<string | null>>(),
  setex: vi.fn<[key: string, ttl: number, value: string], Promise<'OK'>>().mockResolvedValue('OK'),
};
let redisReady = true;

vi.mock('../../lib/redisClient.js', () => ({
  getRedisClient: () => mockRedis,
  isRedisReady: () => redisReady,
}));

// Import after mock setup
const { wikipediaRouter } = await import('../wikipedia.js');

function makeApp() {
  const app = express();
  app.use('/', wikipediaRouter);
  return app;
}

function makeGeoResponse(items: Array<{ title: string; lat: number; lon: number; pageid: number }>) {
  return { query: { geosearch: items } };
}

function makeArticleResponse(pageId: number, extract: string, categories: string[] = []) {
  return {
    query: {
      pages: {
        [pageId]: {
          extract,
          categories: categories.map(title => ({ title })),
        },
      },
    },
  };
}

// The response body is newline-delimited JSON (one chunk per line, streamed as
// each batch of articles resolves) rather than a single JSON object, so tests
// merge all lines back into one dict to assert against — equivalent to what
// the old single-JSON-body response represented.
function parseNdjson(text: string): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) Object.assign(merged, JSON.parse(trimmed));
  }
  return merged;
}

// A small bounding box centered roughly on Big Ben, used across tests in place of lat/lng.
const BBOX_QS = 'north=51.51&south=51.49&east=-0.11&west=-0.13';

beforeEach(() => {
  vi.clearAllMocks();
  redisReady = true;
  mockRedis.get.mockResolvedValue(null);
  mockRedis.setex.mockResolvedValue('OK');
});

describe('GET /api/wikipedia', () => {
  it('returns 400 when bounds are missing', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await request(makeApp()).get('/');
    expect(res.status).toBe(400);
  });

  it('returns 400 when a bound is not a number', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await request(makeApp()).get('/?north=abc&south=51.49&east=-0.11&west=-0.13');
    expect(res.status).toBe(400);
  });

  it('returns 400 when north is not greater than south', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await request(makeApp()).get('/?north=51.49&south=51.51&east=-0.11&west=-0.13');
    expect(res.status).toBe(400);
  });

  it('returns 400 when east is not greater than west', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await request(makeApp()).get('/?north=51.51&south=51.49&east=-0.13&west=-0.11');
    expect(res.status).toBe(400);
  });

  it('returns 400 when the bounding box is too large', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await request(makeApp()).get('/?north=60&south=10&east=10&west=-10');
    expect(res.status).toBe(400);
  });

  it('returns cached result from Redis without calling Wikipedia', async () => {
    const cachedData = { 42: { title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.', category: 'historic' } };
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedData));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get(`/?${BBOX_QS}`);

    expect(res.status).toBe(200);
    expect(parseNdjson(res.text)).toEqual(cachedData);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });

  it('calls Wikipedia with a gsbbox param and gslimit=500 on Redis cache miss, and stores result', async () => {
    mockRedis.get.mockResolvedValue(null);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGeoResponse([{ title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 }]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeArticleResponse(42, 'Clock tower.') });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get(`/?${BBOX_QS}`);

    expect(res.status).toBe(200);
    expect(parseNdjson(res.text)[42].title).toBe('Big Ben');
    expect(parseNdjson(res.text)[42].extract).toBe('Clock tower.');
    expect(parseNdjson(res.text)[42].category).toBe('default');

    const geoSearchUrl = fetchMock.mock.calls[0][0] as string;
    expect(geoSearchUrl).toContain('gsbbox=51.51%7C-0.13%7C51.49%7C-0.11');
    expect(geoSearchUrl).toContain('gslimit=500');
    expect(geoSearchUrl).not.toContain('gscoord');
    expect(geoSearchUrl).not.toContain('gsradius');

    const setexCalls = mockRedis.setex.mock.calls;
    const geoCacheCall = setexCalls.find(([key]) => (key as string).startsWith('wiki:geo:'));
    expect(geoCacheCall).toBeTruthy();
    expect(geoCacheCall![1]).toBe(86400); // 24h TTL
  });

  it('writes the per-article cache under the same key it reads from (regression: wiki:extract vs wiki:article mismatch)', async () => {
    mockRedis.get.mockResolvedValue(null);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGeoResponse([{ title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 }]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeArticleResponse(42, 'Clock tower.') });
    vi.stubGlobal('fetch', fetchMock);

    await request(makeApp()).get(`/?${BBOX_QS}`);

    const extractSetexCall = mockRedis.setex.mock.calls.find(([key]) => (key as string).includes('42') && !(key as string).startsWith('wiki:geo:'));
    expect(extractSetexCall).toBeTruthy();
    const writtenKey = extractSetexCall![0] as string;
    const writtenValue = extractSetexCall![2] as string;

    // A fresh request for a different bounding box (so the geo cache doesn't
    // short-circuit) should hit the per-article cache via a `get` on this exact
    // key — if the write and read keys don't match, this simulated round-trip
    // would come back null and silently re-fetch from Wikipedia instead.
    vi.clearAllMocks();
    mockRedis.get.mockImplementation(async (key: string) => key === writtenKey ? writtenValue : null);
    const fetchMock2 = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGeoResponse([{ title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 }]) });
    vi.stubGlobal('fetch', fetchMock2);

    const res2 = await request(makeApp()).get('/?north=52.51&south=52.49&east=-0.11&west=-0.13');

    expect(parseNdjson(res2.text)[42].extract).toBe('Clock tower.');
    expect(fetchMock2).toHaveBeenCalledTimes(1); // geosearch only — no article batch fetch needed
  });

  it('retries a batch fetch after a 429 rate limit and recovers the real category (regression: silent 429 -> permanent default category)', async () => {
    mockRedis.get.mockResolvedValue(null);
    const rateLimited = {
      ok: false, status: 429,
      // Real (not faked) short delay — retry-after is in seconds, and fake timers
      // don't play well with supertest's real HTTP round-trip.
      headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '0.02' : null) },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGeoResponse([{ title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 }]) })
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeArticleResponse(42, 'Clock tower.', ['Historic sites']) });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get(`/?${BBOX_QS}`);

    expect(res.status).toBe(200);
    expect(parseNdjson(res.text)[42].category).toBe('historic');
    expect(parseNdjson(res.text)[42].extract).toBe('Clock tower.');
    expect(fetchMock).toHaveBeenCalledTimes(3); // geosearch + rate-limited attempt + successful retry
  });

  it('limits article-batch fetches to a bounded concurrency instead of firing every batch at once (regression: unbounded Promise.all triggers Wikipedia 429s)', async () => {
    mockRedis.get.mockResolvedValue(null);
    const geoItems = Array.from({ length: 120 }, (_, i) => ({ title: `Article ${i}`, lat: 51.5, lon: -0.12, pageid: 1000 + i })); // -> 6 batches of 20

    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('list=geosearch')) {
        return { ok: true, status: 200, json: async () => makeGeoResponse(geoItems) };
      }
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return { ok: true, status: 200, json: async () => ({ query: { pages: {} } }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get(`/?${BBOX_QS}`);

    expect(res.status).toBe(200);
    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(fetchMock).toHaveBeenCalledTimes(1 + 6); // geosearch + 6 article batches
  });

  it('classifies articles with known category keywords', async () => {
    mockRedis.get.mockResolvedValue(null);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGeoResponse([{ title: 'Natural History Museum', lat: 51.5, lon: -0.17, pageid: 42 }]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeArticleResponse(42, 'A museum.', ['Category:Museums in London']) });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get(`/?${BBOX_QS}`);

    expect(res.status).toBe(200);
    expect(parseNdjson(res.text)[42].category).toBe('museum');
  });

  it('serves extract and category from Redis cache', async () => {
    mockRedis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify({ extract: 'Cached extract.', category: 'park' }));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGeoResponse([{ title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 }]) });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get(`/?${BBOX_QS}`);

    expect(res.status).toBe(200);
    expect(parseNdjson(res.text)[42].extract).toBe('Cached extract.');
    expect(parseNdjson(res.text)[42].category).toBe('park');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back gracefully for legacy plain-string extract cache entries', async () => {
    mockRedis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('Legacy plain extract.');

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGeoResponse([{ title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 }]) });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get(`/?${BBOX_QS}`);

    expect(res.status).toBe(200);
    expect(parseNdjson(res.text)[42].extract).toBe('Legacy plain extract.');
    expect(parseNdjson(res.text)[42].category).toBe('default');
  });

  it('falls through to Wikipedia when Redis is unavailable', async () => {
    redisReady = false;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGeoResponse([{ title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 }]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeArticleResponse(42, 'Clock tower.') });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get(`/?${BBOX_QS}`);

    expect(res.status).toBe(200);
    expect(parseNdjson(res.text)[42].title).toBe('Big Ben');
    expect(mockRedis.get).not.toHaveBeenCalled();
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });

  it('returns 429 when Wikipedia geosearch returns 429', async () => {
    mockRedis.get.mockResolvedValue(null);
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get(`/?${BBOX_QS}`);
    expect(res.status).toBe(429);
  });

  it('returns 502 when Wikipedia geosearch network request fails', async () => {
    mockRedis.get.mockResolvedValue(null);
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get(`/?${BBOX_QS}`);
    expect(res.status).toBe(502);
  });

  it('returns articles even when an article fetch fails', async () => {
    mockRedis.get.mockResolvedValue(null);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGeoResponse([{ title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 }]) })
      .mockRejectedValueOnce(new Error('article fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get(`/?${BBOX_QS}`);

    expect(res.status).toBe(200);
    expect(parseNdjson(res.text)[42].title).toBe('Big Ben');
    expect(parseNdjson(res.text)[42].extract).toBeUndefined();
    expect(parseNdjson(res.text)[42].category).toBe('default');
  });
});
