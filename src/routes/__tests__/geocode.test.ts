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

vi.mock('../../lib/nominatimThrottle.js', () => ({
  throttledFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));

// Import after mock setup
const { geocodeRouter } = await import('../geocode.js');

function makeApp() {
  const app = express();
  app.use('/', geocodeRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  redisReady = true;
  mockRedis.get.mockResolvedValue(null);
  mockRedis.setex.mockResolvedValue('OK');
});

describe('GET /search', () => {
  it('returns 400 when q is missing', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await request(makeApp()).get('/search');
    expect(res.status).toBe(400);
  });

  it('returns cached result from Redis without calling Nominatim', async () => {
    const cachedData = { results: [{ lat: 51.5, lon: -0.12, displayName: 'Big Ben, London' }] };
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedData));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/search?q=Big+Ben');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cachedData);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });

  it('calls Nominatim on cache miss with a User-Agent header and stores a positive-TTL result', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => [{ lat: '51.5', lon: '-0.12', display_name: 'Big Ben, London' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/search?q=Big+Ben');

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([{ lat: 51.5, lon: -0.12, displayName: 'Big Ben, London' }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/search?');
    expect(url).toContain('q=Big+Ben');
    expect((init.headers as Record<string, string>)['User-Agent']).toBeTruthy();

    const setexCall = mockRedis.setex.mock.calls[0];
    expect(setexCall[0]).toBe('geocode:search:big ben');
    expect(setexCall[1]).toBe(30 * 24 * 60 * 60);
  });

  it('passes through multiple candidates and requests limit=5 from Nominatim', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => [
        { lat: '39.8', lon: '-89.6', display_name: 'Springfield, Illinois, USA' },
        { lat: '42.1', lon: '-72.6', display_name: 'Springfield, Massachusetts, USA' },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/search?q=Springfield');

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([
      { lat: 39.8, lon: -89.6, displayName: 'Springfield, Illinois, USA' },
      { lat: 42.1, lon: -72.6, displayName: 'Springfield, Massachusetts, USA' },
    ]);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('limit=5');
  });

  it('caches empty results with a short negative TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/search?q=xyznonexistent');

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    const setexCall = mockRedis.setex.mock.calls[0];
    expect(setexCall[1]).toBe(60 * 60);
  });

  it('returns 429 when Nominatim returns 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 429 }));
    const res = await request(makeApp()).get('/search?q=Big+Ben');
    expect(res.status).toBe(429);
  });

  it('returns 502 on a non-ok Nominatim response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }));
    const res = await request(makeApp()).get('/search?q=Big+Ben');
    expect(res.status).toBe(502);
  });

  it('returns 502 when the Nominatim request throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network error')));
    const res = await request(makeApp()).get('/search?q=Big+Ben');
    expect(res.status).toBe(502);
  });

  it('returns 502 when Nominatim response JSON parsing fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => { throw new Error('bad json'); },
    }));
    const res = await request(makeApp()).get('/search?q=Big+Ben');
    expect(res.status).toBe(502);
  });

  it('falls through to Nominatim when Redis is unavailable', async () => {
    redisReady = false;
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => [{ lat: '51.5', lon: '-0.12', display_name: 'Big Ben, London' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/search?q=Big+Ben');

    expect(res.status).toBe(200);
    expect(mockRedis.get).not.toHaveBeenCalled();
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });
});

describe('GET /reverse', () => {
  it('returns 400 when lat/lng are missing or not numbers', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await request(makeApp()).get('/reverse?lat=abc&lng=0');
    expect(res.status).toBe(400);
  });

  it('returns cached result from Redis without calling Nominatim', async () => {
    const cachedData = { result: { lat: 51.5, lon: -0.12, displayName: 'Big Ben, London' } };
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(cachedData));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/reverse?lat=51.5&lng=-0.12');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cachedData);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls Nominatim on cache miss and stores a positive-TTL result', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ lat: '51.5', lon: '-0.12', display_name: 'Big Ben, London' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/reverse?lat=51.5&lng=-0.12');

    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ lat: 51.5, lon: -0.12, displayName: 'Big Ben, London' });

    const setexCall = mockRedis.setex.mock.calls[0];
    expect(setexCall[0]).toBe('geocode:reverse:51.50000:-0.12000');
    expect(setexCall[1]).toBe(30 * 24 * 60 * 60);
  });

  it('caches an "Unable to geocode" response as a null result with a short negative TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ error: 'Unable to geocode' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/reverse?lat=0&lng=0');

    expect(res.status).toBe(200);
    expect(res.body.result).toBeNull();
    const setexCall = mockRedis.setex.mock.calls[0];
    expect(setexCall[1]).toBe(60 * 60);
  });

  it('returns 429 when Nominatim returns 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 429 }));
    const res = await request(makeApp()).get('/reverse?lat=0&lng=0');
    expect(res.status).toBe(429);
  });

  it('returns 502 on a non-ok Nominatim response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }));
    const res = await request(makeApp()).get('/reverse?lat=0&lng=0');
    expect(res.status).toBe(502);
  });

  it('returns 502 when the Nominatim request throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network error')));
    const res = await request(makeApp()).get('/reverse?lat=0&lng=0');
    expect(res.status).toBe(502);
  });

  it('falls through to Nominatim when Redis is unavailable', async () => {
    redisReady = false;
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ lat: '51.5', lon: '-0.12', display_name: 'Big Ben, London' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp()).get('/reverse?lat=51.5&lng=-0.12');

    expect(res.status).toBe(200);
    expect(mockRedis.get).not.toHaveBeenCalled();
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });
});
