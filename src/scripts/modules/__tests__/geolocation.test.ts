import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentPosition, codeAddress } from '../geolocation.js';
import * as geocode from '../geocode.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(geocode, 'searchAddress').mockResolvedValue({ status: 'error' });
});

describe('getCurrentPosition', () => {
  it('resolves with a coordinate when geolocation succeeds', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((success) =>
          success({ coords: { latitude: 40.71, longitude: -74.0 } })
        ),
      },
      configurable: true,
    });

    const result = await getCurrentPosition();
    expect(result).toEqual({ lat: 40.71, lng: -74.0 });
  });

  it('passes a finite timeout so an unanswered permission prompt cannot hang forever', async () => {
    const getCurrentPositionMock = vi.fn(
      (success: PositionCallback, _error?: PositionErrorCallback, _options?: PositionOptions) =>
        success({ coords: { latitude: 40.71, longitude: -74.0 } } as GeolocationPosition)
    );
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: getCurrentPositionMock },
      configurable: true,
    });

    await getCurrentPosition();

    const options = getCurrentPositionMock.mock.calls[0][2] as PositionOptions | undefined;
    expect(options?.timeout).toBeGreaterThan(0);
    expect(options?.timeout).not.toBe(Infinity);
  });

  it('falls back to Charlotte coordinates on geolocation error', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((_success, error) =>
          error({ message: 'Permission denied' })
        ),
      },
      configurable: true,
    });

    const result = await getCurrentPosition();
    expect(result).toEqual({ lat: 35.22, lng: -80.84 });
  });

  it('falls back to Charlotte when navigator.geolocation is unavailable', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: undefined,
      configurable: true,
    });

    const result = await getCurrentPosition();
    expect(result).toEqual({ lat: 35.22, lng: -80.84 });
  });
});

describe('codeAddress', () => {
  it('tries Nominatim even for an address in the hardcoded lookup table', async () => {
    const searchAddressSpy = vi.spyOn(geocode, 'searchAddress').mockResolvedValue({ status: 'error' });

    await codeAddress('charlotte');

    expect(searchAddressSpy).toHaveBeenCalledWith('charlotte');
  });

  it('prefers a Nominatim multiple-choice result over a hardcoded lookup table entry', async () => {
    // Regression test: "nyungwe" is a curated CITY_COORDS entry, but Nominatim
    // itself has several distinct "Nyungwe" matches — the curated table must
    // not shortcut past real disambiguation.
    vi.spyOn(geocode, 'searchAddress').mockResolvedValue({
      status: 'ok',
      places: [
        { latitude: -2.4649, longitude: 29.1852, displayName: 'Nyungwe National Park, Rwanda' },
        { latitude: -2.5011, longitude: 29.1978, displayName: 'Nyungwe Forest, Rwanda' },
      ],
    });

    const result = await codeAddress('nyungwe');

    expect(result.status).toBe('multiple');
  });

  it('falls back to the hardcoded lookup table when Nominatim is unreachable', async () => {
    vi.spyOn(geocode, 'searchAddress').mockResolvedValue({ status: 'error' });

    const result = await codeAddress('charlotte');

    expect(result).toEqual({ status: 'success', latitude: 35.2271, longitude: -80.8431 });
  });

  it('resolves with success from Nominatim', async () => {
    vi.spyOn(geocode, 'searchAddress').mockResolvedValue({
      status: 'ok',
      places: [{ latitude: 51.5, longitude: -0.12, displayName: 'Big Ben, London' }],
    });

    const result = await codeAddress('Big Ben');

    expect(result).toEqual({ status: 'success', latitude: 51.5, longitude: -0.12, displayName: 'Big Ben, London' });
  });

  it('resolves with a multiple-choice status when Nominatim returns more than one candidate', async () => {
    vi.spyOn(geocode, 'searchAddress').mockResolvedValue({
      status: 'ok',
      places: [
        { latitude: 39.8, longitude: -89.6, displayName: 'Springfield, Illinois, USA' },
        { latitude: 42.1, longitude: -72.6, displayName: 'Springfield, Massachusetts, USA' },
      ],
    });

    const result = await codeAddress('Springfield');

    expect(result).toEqual({
      status: 'multiple',
      choices: [
        { latitude: 39.8, longitude: -89.6, displayName: 'Springfield, Illinois, USA' },
        { latitude: 42.1, longitude: -72.6, displayName: 'Springfield, Massachusetts, USA' },
      ],
    });
  });

  it('resolves with an error status when Nominatim is rate-limited and no lookup table entry matches', async () => {
    vi.spyOn(geocode, 'searchAddress').mockResolvedValue({ status: 'rate-limited' });

    const result = await codeAddress('1 Infinite Loop, Cupertino');

    expect(result).toEqual({ status: 'error', message: 'rate-limited' });
  });

  it('resolves with an error status when Nominatim returns not-found and no lookup table entry matches', async () => {
    vi.spyOn(geocode, 'searchAddress').mockResolvedValue({ status: 'not-found' });

    const result = await codeAddress('1 Infinite Loop, Cupertino');

    expect(result).toEqual({ status: 'error', message: 'not-found' });
  });
});
