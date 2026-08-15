import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MapLibreMap } from 'maplibre-gl';
import type { Coordinate } from '../coordinate.js';
import { getCircleIcon, getCategoryIcon, placeMapMarker, _resetSharedPopup } from '../marker.js';

const {
  mockPopupElement,
  mockSetHTML,
  mockPopupSetLngLat,
  mockPopupAddTo,
  mockPopupGetElement,
  mockPopupRemove,
  mockPopupConstructor,
  mockMarkerSetLngLat,
  mockMarkerAddTo,
  mockMarkerGetElement,
  mockMarkerConstructor,
  getMarkerElement,
  resetMarkerElement,
} = vi.hoisted(() => {
  const popupElement = document.createElement('div');
  const setHTML = vi.fn().mockReturnThis();
  const popupSetLngLat = vi.fn().mockReturnThis();
  const popupAddTo = vi.fn().mockReturnThis();
  const popupGetElement = vi.fn(() => popupElement);
  const popupRemove = vi.fn();
  const popupConstructor = vi.fn(() => ({
    setLngLat: popupSetLngLat,
    setHTML,
    addTo: popupAddTo,
    getElement: popupGetElement,
    remove: popupRemove,
  }));

  let markerElement = document.createElement('div');
  const markerSetLngLat = vi.fn().mockReturnThis();
  const markerAddTo = vi.fn().mockReturnThis();
  const markerGetElement = vi.fn(() => markerElement);
  const markerConstructor = vi.fn(() => ({
    setLngLat: markerSetLngLat,
    addTo: markerAddTo,
    getElement: markerGetElement,
  }));

  return {
    mockPopupElement: popupElement,
    mockSetHTML: setHTML,
    mockPopupSetLngLat: popupSetLngLat,
    mockPopupAddTo: popupAddTo,
    mockPopupGetElement: popupGetElement,
    mockPopupRemove: popupRemove,
    mockPopupConstructor: popupConstructor,
    mockMarkerSetLngLat: markerSetLngLat,
    mockMarkerAddTo: markerAddTo,
    mockMarkerGetElement: markerGetElement,
    mockMarkerConstructor: markerConstructor,
    getMarkerElement: () => markerElement,
    resetMarkerElement: () => { markerElement = document.createElement('div'); },
  };
});

vi.mock('maplibre-gl', () => ({
  Marker: mockMarkerConstructor,
  Popup: mockPopupConstructor,
}));

beforeEach(() => {
  _resetSharedPopup();
  mockPopupElement.innerHTML = '';
  resetMarkerElement();
  vi.clearAllMocks();
});

describe('getCircleIcon', () => {
  it('creates a pin element with the specified background color', () => {
    const el = getCircleIcon('red');
    expect(el.innerHTML).toContain('fill="red"');
  });

  it('defaults to red when no color is provided', () => {
    const el = getCircleIcon();
    expect(el.innerHTML).toContain('fill="red"');
  });
});

describe('getCategoryIcon', () => {
  it('renders the glyph for the given category', () => {
    const el = getCategoryIcon('museum');
    expect(el.innerHTML).toContain('🏛');
  });

  it('falls back to the default category style for an unknown category', () => {
    const el = getCategoryIcon(undefined);
    expect(el.innerHTML).toContain('?');
  });
});

describe('placeMapMarker', () => {
  const mockMap = {} as MapLibreMap;
  const coord: Coordinate = { lat: 12, lng: 34 };

  it('creates a Marker anchored to the bottom and sets its position', () => {
    placeMapMarker(mockMap, coord, 'Test Marker');
    expect(mockMarkerConstructor).toHaveBeenCalledWith(expect.objectContaining({ anchor: 'bottom' }));
    expect(mockMarkerSetLngLat).toHaveBeenCalledWith([34, 12]);
    expect(mockMarkerAddTo).toHaveBeenCalledWith(mockMap);
  });

  it('sets the marker title', () => {
    placeMapMarker(mockMap, coord, 'Test Marker');
    expect(getMarkerElement().title).toBe('Test Marker');
  });

  it('does not create a Popup when popupContent is undefined', () => {
    placeMapMarker(mockMap, coord, 'No Popup');
    expect(mockPopupConstructor).not.toHaveBeenCalled();
  });

  it('attaches a click listener when popupContent is provided', () => {
    const addEventListenerSpy = vi.spyOn(getMarkerElement(), 'addEventListener');
    placeMapMarker(mockMap, coord, 'With Popup', 'Some content');
    expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
    addEventListenerSpy.mockRestore();
  });

  it('opens the shared popup on marker click', () => {
    placeMapMarker(mockMap, coord, 'With Popup', 'Some content');
    getMarkerElement().dispatchEvent(new MouseEvent('click'));
    expect(mockSetHTML).toHaveBeenCalledWith('Some content');
    expect(mockPopupAddTo).toHaveBeenCalledWith(mockMap);
  });

  it('reuses the shared Popup across multiple markers', () => {
    placeMapMarker(mockMap, coord, 'Marker A', 'Content A', undefined, true);
    placeMapMarker(mockMap, coord, 'Marker B', 'Content B', undefined, true);
    expect(mockPopupConstructor).toHaveBeenCalledTimes(1);
  });

  it('opens the popup immediately when startopen is true', () => {
    placeMapMarker(mockMap, coord, 'Open Now', 'Content', undefined, true);
    expect(mockSetHTML).toHaveBeenCalledWith('Content');
    expect(mockPopupAddTo).toHaveBeenCalled();
  });

  it('does not open the popup when startopen is false', () => {
    placeMapMarker(mockMap, coord, 'Stay Closed', 'Content', undefined, false);
    expect(mockPopupAddTo).not.toHaveBeenCalled();
  });

  it('passes the pin element directly as marker content', () => {
    const pin = getCircleIcon('green');
    placeMapMarker(mockMap, coord, 'Pinned', undefined, pin);
    expect(mockMarkerConstructor).toHaveBeenCalledWith(expect.objectContaining({ element: pin }));
  });
});
