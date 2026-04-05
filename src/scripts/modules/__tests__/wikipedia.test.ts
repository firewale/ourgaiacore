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

function makeGeoResponse(items: Array<{ title: string; lat: number; lon: number; pageid: number }>) {
  return {
    query: { geosearch: items },
  };
}

function makeExtractResponse(pageId: number, extract: string) {
  return {
    query: { pages: { [pageId]: { extract } } },
  };
}

describe('getWikipediaData', () => {
  it('calls fetch with gscoord containing lat|lng', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 200, json: async () => makeGeoResponse([]) })
      .mockResolvedValue({ status: 200, json: async () => makeExtractResponse(1, '') });
    vi.stubGlobal('fetch', fetchMock);

    const latLng = new MockLatLng(51.5, -0.12) as unknown as google.maps.LatLng;
    await getWikipediaData(latLng, vi.fn());

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('gscoord=51.5%7C-0.12');
  });

  it('includes origin=* in the geosearch request URL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 200, json: async () => makeGeoResponse([]) });
    vi.stubGlobal('fetch', fetchMock);

    const latLng = new MockLatLng(0, 0) as unknown as google.maps.LatLng;
    await getWikipediaData(latLng, vi.fn());

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('origin=*');
  });

  it('invokes callback with mapped WikiArticle objects and returns ok', async () => {
    const geoItems = [
      { title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 },
    ];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 200, json: async () => makeGeoResponse(geoItems) })
      .mockResolvedValueOnce({ status: 200, json: async () => makeExtractResponse(42, 'Clock tower.') });
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
    const fetchMock = vi.fn().mockResolvedValueOnce({ status: 429 });
    vi.stubGlobal('fetch', fetchMock);

    const latLng = new MockLatLng(10, 10) as unknown as google.maps.LatLng;
    const callback = vi.fn();
    const status: WikiDataStatus = await getWikipediaData(latLng, callback);

    expect(status).toBe('rate-limited');
    expect(callback).not.toHaveBeenCalled();
  });

  it('logs an error and returns error when Wikipedia returns an API error', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      status: 200,
      json: async () => ({ error: { info: 'Bad request' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const latLng = new MockLatLng(0, 0) as unknown as google.maps.LatLng;
    const callback = vi.fn();
    const status: WikiDataStatus = await getWikipediaData(latLng, callback);

    expect(status).toBe('error');
    expect(consoleSpy).toHaveBeenCalledWith('Wikipedia error:', 'Bad request');
    expect(callback).not.toHaveBeenCalled();
  });

  it('handles missing extract gracefully', async () => {
    const geoItems = [{ title: 'Mystery', lat: 0, lon: 0, pageid: 99 }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 200, json: async () => makeGeoResponse(geoItems) })
      .mockResolvedValueOnce({ status: 200, json: async () => ({ query: { pages: { 99: {} } } }) });
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
    const geoItems = [{ title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 200, json: async () => makeGeoResponse(geoItems) })
      .mockResolvedValueOnce({ status: 200, json: async () => makeExtractResponse(42, 'Clock tower.') });
    vi.stubGlobal('fetch', fetchMock);

    const latLng = new MockLatLng(51.5, -0.12) as unknown as google.maps.LatLng;
    await getWikipediaData(latLng, vi.fn());
    await getWikipediaData(latLng, vi.fn());

    // fetch called for geo + 1 extract on first request only
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves cached results to the callback on a cache hit', async () => {
    const geoItems = [{ title: 'Big Ben', lat: 51.5, lon: -0.12, pageid: 42 }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 200, json: async () => makeGeoResponse(geoItems) })
      .mockResolvedValueOnce({ status: 200, json: async () => makeExtractResponse(42, 'Clock tower.') });
    vi.stubGlobal('fetch', fetchMock);

    const latLng = new MockLatLng(51.5, -0.12) as unknown as google.maps.LatLng;
    const callback = vi.fn();
    await getWikipediaData(latLng, vi.fn());
    await getWikipediaData(latLng, callback);

    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0][42].title).toBe('Big Ben');
  });

  it('fetches again for a location that rounds to a different cache key', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue({ status: 200, json: async () => makeGeoResponse([]) });
    vi.stubGlobal('fetch', fetchMock);

    const latLng1 = new MockLatLng(51.50, -0.12) as unknown as google.maps.LatLng;
    const latLng2 = new MockLatLng(51.56, -0.12) as unknown as google.maps.LatLng; // rounds to 51.56
    await getWikipediaData(latLng1, vi.fn());
    await getWikipediaData(latLng2, vi.fn());

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
