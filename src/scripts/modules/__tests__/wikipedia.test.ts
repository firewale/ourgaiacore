import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWikipediaData, clearCache, type WikiDataStatus } from '../wikipedia.js';
import type { Coordinate } from '../coordinate.js';

beforeEach(() => {
  clearCache();
  vi.clearAllMocks();
});

function makeApiResponse(articles: Array<{ title: string; lat: number; long: number; pageId: number; extract?: string }>): Record<number, { title: string; lat: number; long: number; pageId: number; extract?: string }> {
  return Object.fromEntries(articles.map(a => [a.pageId, a]));
}

describe('getWikipediaData', () => {
  it('calls the local API with lat and lng params', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const coord: Coordinate = { lat: 51.5, lng: -0.12 };
    await getWikipediaData(coord, 14, vi.fn());

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/wikipedia');
    expect(url).toContain('lat=51.5');
    expect(url).toContain('lng=-0.12');
    expect(url).toContain('zoom=14');
  });

  it('invokes callback with mapped WikiArticle objects and returns ok', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([{ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const coord: Coordinate = { lat: 51.5, lng: -0.12 };
    const callback = vi.fn();
    const status: WikiDataStatus = await getWikipediaData(coord, 14, callback);

    expect(status).toBe('ok');
    expect(callback).toHaveBeenCalledOnce();
    const results = callback.mock.calls[0][0];
    expect(results[42]).toMatchObject({ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' });
  });

  it('returns rate-limited and does not call callback on a 429 response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchMock);

    const coord: Coordinate = { lat: 10, lng: 10 };
    const callback = vi.fn();
    const status: WikiDataStatus = await getWikipediaData(coord, 14, callback);

    expect(status).toBe('rate-limited');
    expect(callback).not.toHaveBeenCalled();
  });

  it('returns error when server responds with non-ok status', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const coord: Coordinate = { lat: 0, lng: 0 };
    const status: WikiDataStatus = await getWikipediaData(coord, 14, vi.fn());

    expect(status).toBe('error');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('returns error when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const coord: Coordinate = { lat: 0, lng: 0 };
    const status: WikiDataStatus = await getWikipediaData(coord, 14, vi.fn());

    expect(status).toBe('error');
  });

  it('handles missing extract gracefully', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([{ title: 'Mystery', lat: 0, long: 0, pageId: 99 }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const coord: Coordinate = { lat: 0, lng: 0 };
    const callback = vi.fn();
    await getWikipediaData(coord, 14, callback);

    const results = callback.mock.calls[0][0];
    expect(results[99].extract).toBeUndefined();
  });
});

describe('caching', () => {
  it('does not call fetch on a second request for the same location', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([{ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const coord: Coordinate = { lat: 51.5, lng: -0.12 };
    await getWikipediaData(coord, 14, vi.fn());
    await getWikipediaData(coord, 14, vi.fn());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves cached results to the callback on a cache hit', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([{ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const coord: Coordinate = { lat: 51.5, lng: -0.12 };
    const callback = vi.fn();
    await getWikipediaData(coord, 14, vi.fn());
    await getWikipediaData(coord, 14, callback);

    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0][42].title).toBe('Big Ben');
  });

  it('fetches again for a location that rounds to a different cache key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => makeApiResponse([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const coord1: Coordinate = { lat: 51.50, lng: -0.12 };
    const coord2: Coordinate = { lat: 51.56, lng: -0.12 }; // rounds to 51.56
    await getWikipediaData(coord1, 14, vi.fn());
    await getWikipediaData(coord2, 14, vi.fn());

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
