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

// The server streams results as newline-delimited JSON chunks rather than a
// single JSON body — this builds a mock fetch Response whose body is a
// ReadableStream emitting one line per chunk, matching that wire format.
function makeStreamResponse(chunks: Array<Record<number, unknown>>): { ok: true; status: 200; body: ReadableStream<Uint8Array> } {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));
      }
      controller.close();
    },
  });
  return { ok: true, status: 200, body };
}

const LONDON_BOUNDS: Bounds = { north: 51.51, south: 51.49, east: -0.11, west: -0.13 };

describe('getWikipediaData', () => {
  it('calls the local API with a padded bounding box and no lat/lng/zoom params', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeStreamResponse([makeApiResponse([])]));
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
    const fetchMock = vi.fn().mockResolvedValueOnce(makeStreamResponse([makeApiResponse([])]));
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
    const fetchMock = vi.fn().mockResolvedValueOnce(makeStreamResponse([
      makeApiResponse([{ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' }]),
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const callback = vi.fn();
    const status: WikiDataStatus = await getWikipediaData(LONDON_BOUNDS, callback);

    expect(status).toBe('ok');
    // Called once per chunk plus once more at the end with isFinal true.
    expect(callback).toHaveBeenCalledTimes(2);
    const [finalResults, isFinal] = callback.mock.calls[callback.mock.calls.length - 1];
    expect(isFinal).toBe(true);
    expect(finalResults[42]).toMatchObject({ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' });
  });

  it('invokes callback progressively as each chunk arrives, before the final call', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeStreamResponse([
      makeApiResponse([{ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42 }]),
      makeApiResponse([{ title: 'Tower Bridge', lat: 51.5, long: -0.08, pageId: 43 }]),
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const callback = vi.fn();
    await getWikipediaData(LONDON_BOUNDS, callback);

    expect(callback).toHaveBeenCalledTimes(3); // 2 chunks + final
    expect(callback.mock.calls[0][0]).toHaveProperty('42');
    expect(callback.mock.calls[0][0]).not.toHaveProperty('43');
    expect(callback.mock.calls[0][1]).toBe(false);
    expect(callback.mock.calls[1][0]).toHaveProperty('42');
    expect(callback.mock.calls[1][0]).toHaveProperty('43');
    expect(callback.mock.calls[1][1]).toBe(false);
    expect(callback.mock.calls[2][1]).toBe(true);
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

  it('returns error when the response has no body', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, body: null });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const status: WikiDataStatus = await getWikipediaData(LONDON_BOUNDS, vi.fn());

    expect(status).toBe('error');
  });

  it('clamps a very large (e.g. zoomed-out) viewport to a safe bounding box span', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeStreamResponse([makeApiResponse([])]));
    vi.stubGlobal('fetch', fetchMock);

    // A zoomed-out viewport spanning several degrees — padding this would send
    // Wikipedia's geosearch API a bounding box it rejects as "too big" (502).
    const zoomedOut: Bounds = { north: 37.78, south: 37.47, east: -121.68, west: -122.48 };
    await getWikipediaData(zoomedOut, vi.fn());

    const url = new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost');
    const sentNorth = Number(url.searchParams.get('north'));
    const sentSouth = Number(url.searchParams.get('south'));
    const sentEast = Number(url.searchParams.get('east'));
    const sentWest = Number(url.searchParams.get('west'));

    expect(sentNorth - sentSouth).toBeLessThanOrEqual(0.2);
    expect(sentEast - sentWest).toBeLessThanOrEqual(0.2);
  });

  it('handles missing extract gracefully', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeStreamResponse([
      makeApiResponse([{ title: 'Mystery', lat: 0, long: 0, pageId: 99 }]),
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const callback = vi.fn();
    await getWikipediaData(LONDON_BOUNDS, callback);

    const [finalResults] = callback.mock.calls[callback.mock.calls.length - 1];
    expect(finalResults[99].extract).toBeUndefined();
  });
});

describe('caching', () => {
  it('does not call fetch on a second request for the same bounds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeStreamResponse([
      makeApiResponse([{ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' }]),
    ]));
    vi.stubGlobal('fetch', fetchMock);

    await getWikipediaData(LONDON_BOUNDS, vi.fn());
    await getWikipediaData(LONDON_BOUNDS, vi.fn());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch for a slightly panned viewport that still falls within the padded box', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeStreamResponse([makeApiResponse([])]));
    vi.stubGlobal('fetch', fetchMock);

    // Small nudge — the padded (50%) box from the first call comfortably covers this.
    const nudged: Bounds = { north: 51.512, south: 51.492, east: -0.108, west: -0.128 };
    await getWikipediaData(LONDON_BOUNDS, vi.fn());
    await getWikipediaData(nudged, vi.fn());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves cached results to the callback on a cache hit', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeStreamResponse([
      makeApiResponse([{ title: 'Big Ben', lat: 51.5, long: -0.12, pageId: 42, extract: 'Clock tower.' }]),
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const callback = vi.fn();
    await getWikipediaData(LONDON_BOUNDS, vi.fn());
    await getWikipediaData(LONDON_BOUNDS, callback);

    // A cache hit is synchronous and already-complete — no streaming, one call.
    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0][42].title).toBe('Big Ben');
    expect(callback.mock.calls[0][1]).toBe(true);
  });

  it('does not re-fetch when zooming into a smaller viewport already covered by the padded box', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeStreamResponse([makeApiResponse([])]));
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
    const fetchMock = vi.fn().mockImplementation(async () => makeStreamResponse([makeApiResponse([])]));
    vi.stubGlobal('fetch', fetchMock);

    const bounds1: Bounds = { north: 51.51, south: 51.49, east: -0.11, west: -0.13 };
    const bounds2: Bounds = { north: 52.11, south: 52.09, east: -0.11, west: -0.13 }; // far outside bounds1's padded box
    await getWikipediaData(bounds1, vi.fn());
    await getWikipediaData(bounds2, vi.fn());

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
