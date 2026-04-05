import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentPosition, codeAddress } from '../geolocation.js';

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

    const result = await codeAddress('London');
    expect(result).toEqual({ status: 'success', latitude: 51.5, longitude: -0.12 });
  });

  it('resolves with error status on geocoder failure', async () => {
    mockGeocode.mockImplementation((_req: unknown, callback: Function) => {
      callback(null, 'ZERO_RESULTS');
    });

    const result = await codeAddress('xyznonexistent');
    expect(result).toEqual({ status: 'error', message: 'ZERO_RESULTS' });
  });
});
