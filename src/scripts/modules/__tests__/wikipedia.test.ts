import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWikipediaData, clearCache, type WikiDataStatus } from '../wikipedia.js';

class MockLatLng {
  constructor(private _lat: number, private _lng: number) {}
  lat() { return this._lat; }
  lng() { return this._lng; }
}

beforeEach(() => {
  vi.stubGlobal('google', {
    maps: { LatLng: MockLatLng },
  });
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

    const latLng = new MockLatLng(51.5, -0.12) as unknown as google.maps.LatLng;
    await getWikipediaData(latLng, vi.fn());

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/wikipedia');
    expect(url).toContain('lat=51.5');
    expect(url).toContain('lng=-0.12');
  });

  it('invokes callback with mapped WikiArticle objects and returns ok', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([{ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const latLng = new MockLatLng(51.5, -0.12) as unknown as google.maps.LatLng;
    const callback = vi.fn();
    const status: WikiDataStatus = await getWikipediaData(latLng, callback);

    expect(status).toBe('ok');
    expect(callback).toHaveBeenCalledOnce();
    const results = callback.mock.calls[0][0];
    expect(results[42]).toMatchObject({ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' });
  });

  it('returns rate-limited and does not call callback on a 429 response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchMock);

    const latLng = new MockLatLng(10, 10) as unknown as google.maps.LatLng;
    const callback = vi.fn();
    const status: WikiDataStatus = await getWikipediaData(latLng, callback);

    expect(status).toBe('rate-limited');
    expect(callback).not.toHaveBeenCalled();
  });

  it('returns error when server responds with non-ok status', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const latLng = new MockLatLng(0, 0) as unknown as google.maps.LatLng;
    const status: WikiDataStatus = await getWikipediaData(latLng, vi.fn());

    expect(status).toBe('error');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('returns error when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const latLng = new MockLatLng(0, 0) as unknown as google.maps.LatLng;
    const status: WikiDataStatus = await getWikipediaData(latLng, vi.fn());

    expect(status).toBe('error');
  });

  it('handles missing extract gracefully', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([{ title: 'Mystery', lat: 0, long: 0, pageId: 99 }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const latLng = new MockLatLng(0, 0) as unknown as google.maps.LatLng;
    const callback = vi.fn();
    await getWikipediaData(latLng, callback);

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

    const latLng = new MockLatLng(51.5, -0.12) as unknown as google.maps.LatLng;
    await getWikipediaData(latLng, vi.fn());
    await getWikipediaData(latLng, vi.fn());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves cached results to the callback on a cache hit', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([{ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const latLng = new MockLatLng(51.5, -0.12) as unknown as google.maps.LatLng;
    const callback = vi.fn();
    await getWikipediaData(latLng, vi.fn());
    await getWikipediaData(latLng, callback);

    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0][42].title).toBe('Big Ben');
  });

  it('fetches again for a location that rounds to a different cache key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => makeApiResponse([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const latLng1 = new MockLatLng(51.50, -0.12) as unknown as google.maps.LatLng;
    const latLng2 = new MockLatLng(51.56, -0.12) as unknown as google.maps.LatLng; // rounds to 51.56
    await getWikipediaData(latLng1, vi.fn());
    await getWikipediaData(latLng2, vi.fn());

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
