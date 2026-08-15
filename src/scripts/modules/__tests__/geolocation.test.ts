import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentPosition, codeAddress } from '../geolocation.js';
import * as geocode from '../geocode.js';

class MockLatLng {
  constructor(public lat: number, public lng: number) {}
}

const mockGeocode = vi.fn();

beforeEach(() => {
  vi.stubGlobal('google', {
    maps: {
      LatLng: MockLatLng,
      Geocoder: vi.fn(() => ({ geocode: mockGeocode })),
      GeocoderStatus: { OK: 'OK' },
    },
  });
  vi.clearAllMocks();
  vi.spyOn(geocode, 'searchAddress').mockResolvedValue({ status: 'error' });
});

describe('getCurrentPosition', () => {
  it('resolves with a LatLng when geolocation succeeds', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((success) =>
          success({ coords: { latitude: 40.71, longitude: -74.0 } })
        ),
      },
      configurable: true,
    });

    const result = await getCurrentPosition();
    expect(result).toBeInstanceOf(MockLatLng);
    expect((result as unknown as MockLatLng).lat).toBe(40.71);
    expect((result as unknown as MockLatLng).lng).toBe(-74.0);
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

    const result = await getCurrentPosition() as unknown as MockLatLng;
    expect(result.lat).toBe(35.22);
    expect(result.lng).toBe(-80.84);
  });

  it('falls back to Charlotte when navigator.geolocation is unavailable', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: undefined,
      configurable: true,
    });

    const result = await getCurrentPosition() as unknown as MockLatLng;
    expect(result.lat).toBe(35.22);
    expect(result.lng).toBe(-80.84);
  });
});

describe('codeAddress', () => {
  it('resolves with success status and coordinates on OK geocoder result', async () => {
    mockGeocode.mockImplementation((_req: unknown, callback: Function) => {
      callback(
        [{ geometry: { location: { lat: () => 51.5, lng: () => -0.12 } } }],
        'OK'
      );
    });

    // Use an address not in the hardcoded lookup table so the Geocoder mock is exercised
    const result = await codeAddress('1 Infinite Loop, Cupertino');
    expect(result).toEqual({ status: 'success', latitude: 51.5, longitude: -0.12 });
  });

  it('resolves with error status on geocoder failure', async () => {
    mockGeocode.mockImplementation((_req: unknown, callback: Function) => {
      callback(null, 'ZERO_RESULTS');
    });

    const result = await codeAddress('xyznonexistent');
    expect(result).toEqual({ status: 'error', message: 'ZERO_RESULTS' });
  });

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

    expect(mockGeocode).not.toHaveBeenCalled();
    expect(result.status).toBe('multiple');
  });

  it('falls back to the hardcoded lookup table when Nominatim is unreachable', async () => {
    vi.spyOn(geocode, 'searchAddress').mockResolvedValue({ status: 'error' });

    const result = await codeAddress('charlotte');

    expect(mockGeocode).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'success', latitude: 35.2271, longitude: -80.8431 });
  });

  it('resolves with success from Nominatim without calling the Google Geocoder', async () => {
    vi.spyOn(geocode, 'searchAddress').mockResolvedValue({
      status: 'ok',
      places: [{ latitude: 51.5, longitude: -0.12, displayName: 'Big Ben, London' }],
    });

    const result = await codeAddress('Big Ben');

    expect(mockGeocode).not.toHaveBeenCalled();
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

    expect(mockGeocode).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'multiple',
      choices: [
        { latitude: 39.8, longitude: -89.6, displayName: 'Springfield, Illinois, USA' },
        { latitude: 42.1, longitude: -72.6, displayName: 'Springfield, Massachusetts, USA' },
      ],
    });
  });

  it('falls back to the Google Geocoder when Nominatim is rate-limited', async () => {
    vi.spyOn(geocode, 'searchAddress').mockResolvedValue({ status: 'rate-limited' });
    mockGeocode.mockImplementation((_req: unknown, callback: Function) => {
      callback([{ geometry: { location: { lat: () => 40.71, lng: () => -74.0 } } }], 'OK');
    });

    const result = await codeAddress('1 Infinite Loop, Cupertino');

    expect(mockGeocode).toHaveBeenCalled();
    expect(result).toEqual({ status: 'success', latitude: 40.71, longitude: -74.0 });
  });

  it('falls back to the Google Geocoder when Nominatim returns not-found', async () => {
    vi.spyOn(geocode, 'searchAddress').mockResolvedValue({ status: 'not-found' });
    mockGeocode.mockImplementation((_req: unknown, callback: Function) => {
      callback([{ geometry: { location: { lat: () => 40.71, lng: () => -74.0 } } }], 'OK');
    });

    const result = await codeAddress('1 Infinite Loop, Cupertino');

    expect(mockGeocode).toHaveBeenCalled();
    expect(result).toEqual({ status: 'success', latitude: 40.71, longitude: -74.0 });
  });
});
