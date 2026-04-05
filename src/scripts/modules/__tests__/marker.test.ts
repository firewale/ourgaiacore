import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCircleIcon, placeMapMarker } from '../marker.js';

const mockOpen = vi.fn();
const mockAddListener = vi.fn();
const mockMarkerConstructor = vi.fn(() => ({}));
const mockInfoWindowConstructor = vi.fn(() => ({ open: mockOpen }));

beforeEach(() => {
  vi.stubGlobal('google', {
    maps: {
      SymbolPath: { CIRCLE: 0 },
      Marker: mockMarkerConstructor,
      InfoWindow: mockInfoWindowConstructor,
      event: { addListener: mockAddListener },
    },
  });
  vi.clearAllMocks();
});

describe('getCircleIcon', () => {
  it('returns an icon with the specified fill color', () => {
    const icon = getCircleIcon('red');
    expect(icon.fillColor).toBe('red');
  });

  it('defaults to red when no color is provided', () => {
    const icon = getCircleIcon();
    expect(icon.fillColor).toBe('red');
  });

  it('returns an icon with expected shape properties', () => {
    const icon = getCircleIcon('blue');
    expect(icon.path).toBe(google.maps.SymbolPath.CIRCLE);
    expect(icon.fillOpacity).toBe(0.7);
    expect(icon.scale).toBe(5);
    expect(icon.strokeColor).toBe('white');
    expect(icon.strokeWeight).toBe(0.5);
  });
});

describe('placeMapMarker', () => {
  const mockMap = {} as google.maps.Map;
  const mockLatLng = {} as google.maps.LatLng;

  it('creates a Marker with the correct position and title', () => {
    placeMapMarker(mockMap, mockLatLng, 'Test Marker');
    expect(mockMarkerConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ position: mockLatLng, map: mockMap, title: 'Test Marker' })
    );
  });

  it('does not create an InfoWindow when popupContent is undefined', () => {
    placeMapMarker(mockMap, mockLatLng, 'No Popup');
    expect(mockInfoWindowConstructor).not.toHaveBeenCalled();
  });

  it('creates an InfoWindow and attaches a click listener when popupContent is provided', () => {
    placeMapMarker(mockMap, mockLatLng, 'With Popup', 'Some content');
    expect(mockInfoWindowConstructor).toHaveBeenCalledWith({ content: 'Some content' });
    expect(mockAddListener).toHaveBeenCalledWith(expect.anything(), 'click', expect.any(Function));
  });

  it('opens the InfoWindow immediately when startopen is true', () => {
    placeMapMarker(mockMap, mockLatLng, 'Open Now', 'Content', undefined, true);
    expect(mockOpen).toHaveBeenCalled();
  });

  it('does not open the InfoWindow when startopen is false', () => {
    placeMapMarker(mockMap, mockLatLng, 'Stay Closed', 'Content', undefined, false);
    expect(mockOpen).not.toHaveBeenCalled();
  });
});
