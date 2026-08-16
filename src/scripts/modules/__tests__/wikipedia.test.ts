import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWikipediaData, clearCache, type WikiDataStatus } from '../wikipedia.js';
import type { Bounds } from '../coordinate.js';

beforeEach(() => {
  clearCache();
  vi.clearAllMocks();
});

function makeApiResponse(articles: Array<{ title: string; lat: number; long: number; pageId: number; extract?: string }>): Record<number, { title: string; lat: number; long: number; pageId: number; extract?: string }> {
  return Object.fromEntries(articles.map(a => [a.pageId, a]));
}

const LONDON_BOUNDS: Bounds = { north: 51.51, south: 51.49, east: -0.11, west: -0.13 };

describe('getWikipediaData', () => {
  it('calls the local API with a padded bounding box and no lat/lng/zoom params', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getWikipediaData(LONDON_BOUNDS, vi.fn());

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/wikipedia');
    expect(url).toContain('north=');
    expect(url).toContain('south=');
    expect(url).toContain('east=');
    expect(url).toContain('west=');
    expect(url).not.toContain('lat=');
    expect(url).not.toContain('lng=');
    expect(url).not.toContain('zoom=');
  });

  it('pads the bounding box beyond the raw input bounds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getWikipediaData(LONDON_BOUNDS, vi.fn());

    const url = new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost');
    const sentNorth = Number(url.searchParams.get('north'));
    const sentSouth = Number(url.searchParams.get('south'));
    const sentEast = Number(url.searchParams.get('east'));
    const sentWest = Number(url.searchParams.get('west'));

    expect(sentNorth).toBeGreaterThan(LONDON_BOUNDS.north);
    expect(sentSouth).toBeLessThan(LONDON_BOUNDS.south);
    expect(sentEast).toBeGreaterThan(LONDON_BOUNDS.east);
    expect(sentWest).toBeLessThan(LONDON_BOUNDS.west);
  });

  it('invokes callback with mapped WikiArticle objects and returns ok', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([{ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const callback = vi.fn();
    const status: WikiDataStatus = await getWikipediaData(LONDON_BOUNDS, callback);

    expect(status).toBe('ok');
    expect(callback).toHaveBeenCalledOnce();
    const results = callback.mock.calls[0][0];
    expect(results[42]).toMatchObject({ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' });
  });

  it('returns rate-limited and does not call callback on a 429 response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchMock);

    const callback = vi.fn();
    const status: WikiDataStatus = await getWikipediaData(LONDON_BOUNDS, callback);

    expect(status).toBe('rate-limited');
    expect(callback).not.toHaveBeenCalled();
  });

  it('returns error when server responds with non-ok status', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const status: WikiDataStatus = await getWikipediaData(LONDON_BOUNDS, vi.fn());

    expect(status).toBe('error');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('returns error when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const status: WikiDataStatus = await getWikipediaData(LONDON_BOUNDS, vi.fn());

    expect(status).toBe('error');
  });

  it('handles missing extract gracefully', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([{ title: 'Mystery', lat: 0, long: 0, pageId: 99 }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const callback = vi.fn();
    await getWikipediaData(LONDON_BOUNDS, callback);

    const results = callback.mock.calls[0][0];
    expect(results[99].extract).toBeUndefined();
  });
});

describe('caching', () => {
  it('does not call fetch on a second request for the same bounds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([{ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getWikipediaData(LONDON_BOUNDS, vi.fn());
    await getWikipediaData(LONDON_BOUNDS, vi.fn());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch for a slightly panned viewport that still falls within the padded box', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    // Small nudge — the padded (50%) box from the first call comfortably covers this.
    const nudged: Bounds = { north: 51.512, south: 51.492, east: -0.108, west: -0.128 };
    await getWikipediaData(LONDON_BOUNDS, vi.fn());
    await getWikipediaData(nudged, vi.fn());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves cached results to the callback on a cache hit', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([{ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const callback = vi.fn();
    await getWikipediaData(LONDON_BOUNDS, vi.fn());
    await getWikipediaData(LONDON_BOUNDS, callback);

    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0][42].title).toBe('Big Ben');
  });

  it('does not re-fetch when zooming into a smaller viewport already covered by the padded box', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeApiResponse([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    // Zooming in shrinks the viewport but keeps it centered in the same place —
    // this must be a cache hit against the wider box already fetched, not a fresh
    // request just because the zoom level changed (regression test).
    const zoomedIn: Bounds = { north: 51.505, south: 51.495, east: -0.115, west: -0.125 };
    await getWikipediaData(LONDON_BOUNDS, vi.fn());
    await getWikipediaData(zoomedIn, vi.fn());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches again for bounds not contained in any previously fetched box', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => makeApiResponse([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const bounds1: Bounds = { north: 51.51, south: 51.49, east: -0.11, west: -0.13 };
    const bounds2: Bounds = { north: 52.11, south: 52.09, east: -0.11, west: -0.13 }; // far outside bounds1's padded box
    await getWikipediaData(bounds1, vi.fn());
    await getWikipediaData(bounds2, vi.fn());

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
