import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCircleIcon, placeMapMarker } from '../marker.js';

const mockOpen = vi.fn();
const mockAddEventListener = vi.fn();
const mockPinElement = vi.fn((opts: { background?: string }) => ({
  element: document.createElement('div'),
  background: opts?.background,
}));
const mockMarkerConstructor = vi.fn(() => ({ addEventListener: mockAddEventListener }));
const mockInfoWindowConstructor = vi.fn(() => ({ open: mockOpen }));

beforeEach(() => {
  vi.stubGlobal('google', {
    maps: {
      marker: {
        PinElement: mockPinElement,
        AdvancedMarkerElement: mockMarkerConstructor,
      },
      InfoWindow: mockInfoWindowConstructor,
    },
  });
  vi.clearAllMocks();
});

describe('getCircleIcon', () => {
  it('creates a PinElement with the specified background color', () => {
    getCircleIcon('red');
    expect(mockPinElement).toHaveBeenCalledWith(
      expect.objectContaining({ background: 'red' })
    );
  });

  it('defaults to red when no color is provided', () => {
    getCircleIcon();
    expect(mockPinElement).toHaveBeenCalledWith(
      expect.objectContaining({ background: 'red' })
    );
  });

  it('uses white border and glyph colors', () => {
    getCircleIcon('blue');
    expect(mockPinElement).toHaveBeenCalledWith(
      expect.objectContaining({ borderColor: 'white', glyphColor: 'white' })
    );
  });
});

describe('placeMapMarker', () => {
  const mockMap = {} as google.maps.Map;
  const mockLatLng = {} as google.maps.LatLng;

  it('creates an AdvancedMarkerElement with the correct position and title', () => {
    placeMapMarker(mockMap, mockLatLng, 'Test Marker');
    expect(mockMarkerConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ position: mockLatLng, map: mockMap, title: 'Test Marker' })
    );
  });

  it('does not create an InfoWindow when popupContent is undefined', () => {
    placeMapMarker(mockMap, mockLatLng, 'No Popup');
    expect(mockInfoWindowConstructor).not.toHaveBeenCalled();
  });

  it('sets gmpClickable to true when popupContent is provided', () => {
    placeMapMarker(mockMap, mockLatLng, 'Clickable', 'Some content');
    expect(mockMarkerConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ gmpClickable: true })
    );
  });

  it('sets gmpClickable to false when popupContent is undefined', () => {
    placeMapMarker(mockMap, mockLatLng, 'Not Clickable');
    expect(mockMarkerConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ gmpClickable: false })
    );
  });

  it('creates an InfoWindow and attaches a click listener when popupContent is provided', () => {
    placeMapMarker(mockMap, mockLatLng, 'With Popup', 'Some content');
    expect(mockInfoWindowConstructor).toHaveBeenCalledWith({ content: 'Some content' });
    expect(mockAddEventListener).toHaveBeenCalledWith('gmp-click', expect.any(Function));
  });

  it('opens the InfoWindow immediately when startopen is true', () => {
    placeMapMarker(mockMap, mockLatLng, 'Open Now', 'Content', undefined, true);
    expect(mockOpen).toHaveBeenCalled();
  });

  it('does not open the InfoWindow when startopen is false', () => {
    placeMapMarker(mockMap, mockLatLng, 'Stay Closed', 'Content', undefined, false);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('passes the PinElement directly as marker content', () => {
    const pin = getCircleIcon('green');
    placeMapMarker(mockMap, mockLatLng, 'Pinned', undefined, pin);
    expect(mockMarkerConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ content: pin })
    );
  });
});
