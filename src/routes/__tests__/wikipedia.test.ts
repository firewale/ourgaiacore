// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockRedis = {
  get: vi.fn<() => Promise<string | null>>(),
  setex: vi.fn<() => Promise<'OK'>>().mockResolvedValue('OK'),
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

function makeExtractResponse(pageId: number, extract: string) {
  return { query: { pages: { [pageId]: { extract } } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  redisReady = true;
  mockRedis.get.mockResolvedValue(null);
  mockRedis.setex.mockResolvedValue('OK');
});

describe('GET /api/wikipedia', () => {
  it('returns 400 when lat and lng are missing', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await request(makeApp()).get('/');
    expect(res.status).toBe(400);
  });

  it('returns 400 when lat is not a number', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await request(makeApp()).get('/?lat=abc&lng=0');
    expect(res.status).toBe(400);
  });

  it('returns cached result from Redis without calling Wikipedia', async () => {
    const cachedData = { 42: { title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' } };
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedData));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/?lat=51.5&lng=-0.12');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cachedData);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });

  it('calls Wikipedia on Redis cache miss and stores result', async () => {
    mockRedis.get.mockResolvedValue(null);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGeoResponse([{ title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 }]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeExtractResponse(42, 'Clock tower.') });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/?lat=51.5&lng=-0.12');

    expect(res.status).toBe(200);
    expect(res.body[42].title).toBe('Big Ben');
    expect(res.body[42].extract).toBe('Clock tower.');
    // Should cache the geo result and the extract
    const setexCalls = mockRedis.setex.mock.calls;
    const geoCacheCall = setexCalls.find(([key]) => (key as string).startsWith('wiki:geo:'));
    expect(geoCacheCall).toBeTruthy();
    expect(geoCacheCall![1]).toBe(86400); // 24h TTL
  });

  it('serves extract from Redis cache and skips Wikipedia extract endpoint', async () => {
    // geo cache miss, extract cache hit
    mockRedis.get
      .mockResolvedValueOnce(null)                      // geo cache miss
      .mockResolvedValueOnce('Cached extract.');        // extract cache hit for pageId 42

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGeoResponse([{ title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 }]) });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/?lat=51.5&lng=-0.12');

    expect(res.status).toBe(200);
    expect(res.body[42].extract).toBe('Cached extract.');
    // Only geosearch fetch; no extract fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls through to Wikipedia when Redis is unavailable', async () => {
    redisReady = false;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGeoResponse([{ title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 }]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeExtractResponse(42, 'Clock tower.') });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/?lat=51.5&lng=-0.12');

    expect(res.status).toBe(200);
    expect(res.body[42].title).toBe('Big Ben');
    expect(mockRedis.get).not.toHaveBeenCalled();
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });

  it('returns 429 when Wikipedia geosearch returns 429', async () => {
    mockRedis.get.mockResolvedValue(null);
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/?lat=51.5&lng=-0.12');
    expect(res.status).toBe(429);
  });

  it('returns 502 when Wikipedia geosearch network request fails', async () => {
    mockRedis.get.mockResolvedValue(null);
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/?lat=51.5&lng=-0.12');
    expect(res.status).toBe(502);
  });

  it('returns articles even when an extract fetch fails', async () => {
    mockRedis.get.mockResolvedValue(null);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeGeoResponse([{ title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 }]) })
      .mockRejectedValueOnce(new Error('extract fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/?lat=51.5&lng=-0.12');

    expect(res.status).toBe(200);
    expect(res.body[42].title).toBe('Big Ben');
    expect(res.body[42].extract).toBeUndefined();
  });
});
