import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchAddress, reverseGeocode, clearCache, type NominatimSearchResult } from '../geocode.js';

beforeEach(() => {
  clearCache();
  vi.clearAllMocks();
});

describe('searchAddress', () => {
  it('calls the local API with the query param', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchAddress('Big Ben');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/geocode/search');
    expect(url).toContain('q=Big+Ben');
  });

  it('returns ok with a single place on a successful, unambiguous match', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ results: [{ lat: 51.5, lon: -0.12, displayName: 'Big Ben, London' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result: NominatimSearchResult = await searchAddress('Big Ben');
    expect(result).toEqual({
      status: 'ok',
      places: [{ latitude: 51.5, longitude: -0.12, displayName: 'Big Ben, London' }],
    });
  });

  it('returns ok with all candidate places when the query is ambiguous', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({
        results: [
          { lat: 39.8, lon: -89.6, displayName: 'Springfield, Illinois, USA' },
          { lat: 42.1, lon: -72.6, displayName: 'Springfield, Massachusetts, USA' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchAddress('Springfield');
    expect(result).toEqual({
      status: 'ok',
      places: [
        { latitude: 39.8, longitude: -89.6, displayName: 'Springfield, Illinois, USA' },
        { latitude: 42.1, longitude: -72.6, displayName: 'Springfield, Massachusetts, USA' },
      ],
    });
  });

  it('returns not-found when results are empty', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchAddress('xyznonexistent');
    expect(result).toEqual({ status: 'not-found' });
  });

  it('returns rate-limited on a 429 response without logging', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchMock);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await searchAddress('Big Ben');
    expect(result).toEqual({ status: 'rate-limited' });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('returns error on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await searchAddress('Big Ben');
    expect(result).toEqual({ status: 'error' });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('returns error when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await searchAddress('Big Ben');
    expect(result).toEqual({ status: 'error' });
  });

  it('returns error when json parsing throws', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => { throw new Error('bad json'); },
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await searchAddress('Big Ben');
    expect(result).toEqual({ status: 'error' });
  });

  it('does not call fetch again for the same normalized query', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ results: [{ lat: 51.5, lon: -0.12, displayName: 'Big Ben, London' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchAddress('Big Ben');
    await searchAddress('  big ben  ');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('reverseGeocode', () => {
  it('calls the local API with lat and lng params', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ result: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await reverseGeocode(51.5, -0.12);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/geocode/reverse');
    expect(url).toContain('lat=51.5');
    expect(url).toContain('lng=-0.12');
  });

  it('returns ok with the place on a successful match', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ result: { lat: 51.5, lon: -0.12, displayName: 'Big Ben, London' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await reverseGeocode(51.5, -0.12);
    expect(result).toEqual({
      status: 'ok',
      place: { latitude: 51.5, longitude: -0.12, displayName: 'Big Ben, London' },
    });
  });

  it('returns not-found when result is null', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ result: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await reverseGeocode(0, 0);
    expect(result).toEqual({ status: 'not-found' });
  });

  it('returns rate-limited on a 429 response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await reverseGeocode(0, 0);
    expect(result).toEqual({ status: 'rate-limited' });
  });

  it('returns error on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await reverseGeocode(0, 0);
    expect(result).toEqual({ status: 'error' });
  });

  it('returns error when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await reverseGeocode(0, 0);
    expect(result).toEqual({ status: 'error' });
  });

  it('does not call fetch again for coordinates rounding to the same cache key', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ result: { lat: 51.5, lon: -0.12, displayName: 'Big Ben, London' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await reverseGeocode(51.500001, -0.120001);
    await reverseGeocode(51.5000012, -0.1200009);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches again for coordinates that round to a different cache key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ result: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await reverseGeocode(51.5, -0.12);
    await reverseGeocode(51.6, -0.12);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
