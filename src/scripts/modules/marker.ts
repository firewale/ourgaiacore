import { Marker, Popup, type MapLibreMap } from 'maplibre-gl';
import type { ArticleCategory } from './wikipedia.js';
import type { Coordinate } from './coordinate.js';
import { toLngLat } from './coordinate.js';
import { getCategoryStyle } from './categories.js';

function buildPinElement(background: string, glyph?: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'og-marker-pin';
  el.style.width = '30px';
  el.style.height = '30px';
  // No inline `position` here — MapLibre's own `.maplibregl-marker` CSS class
  // sets `position: absolute`, which it relies on for transform-based
  // repositioning on pan/zoom. An inline override would beat that class rule
  // and leave the marker in normal document flow instead.
  el.innerHTML = `
    <svg width="30" height="30" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C7.58 0 4 3.58 4 8c0 5.25 8 16 8 16s8-10.75 8-16c0-4.42-3.58-8-8-8z" fill="${background}" stroke="white" stroke-width="1.5"/>
    </svg>
    ${glyph ? `<span class="og-marker-glyph" style="position:absolute;top:3px;left:0;width:100%;text-align:center;font-size:12px;line-height:14px;pointer-events:none;">${glyph}</span>` : ''}
  `;
  return el;
}

export function getCircleIcon(color: string = 'red'): HTMLElement {
  return buildPinElement(color);
}

export function getCategoryIcon(category: ArticleCategory = 'default'): HTMLElement {
  const style = getCategoryStyle(category);
  return buildPinElement(style.color, style.glyph);
}

let sharedPopup: Popup | null = null;

function getSharedPopup(): Popup {
  if (!sharedPopup) {
    sharedPopup = new Popup({ closeButton: false, closeOnClick: false, maxWidth: '380px' });
  }
  return sharedPopup;
}

export function _resetSharedPopup(): void {
  sharedPopup = null;
}

function openPopup(
  map: MapLibreMap,
  coord: Coordinate,
  popupContent: string,
  onOpen?: (popupEl: HTMLElement) => void
): void {
  const popup = getSharedPopup();
  popup.setLngLat(toLngLat(coord)).setHTML(popupContent).addTo(map);
  const popupEl = popup.getElement();
  popupEl?.querySelector('.og-popup__close')?.addEventListener('click', () => {
    popup.remove();
  });
  if (popupEl) onOpen?.(popupEl);
}

export function placeMapMarker(
  map: MapLibreMap,
  coord: Coordinate,
  title: string,
  popupContent?: string,
  pin?: HTMLElement,
  startopen?: boolean,
  onPopupOpen?: (popupEl: HTMLElement) => void
): Marker {
  const marker = new Marker(pin ? { element: pin, anchor: 'bottom' } : { anchor: 'bottom' })
    .setLngLat(toLngLat(coord))
    .addTo(map);
  marker.getElement().title = title;

  if (popupContent === undefined) return marker;

  marker.getElement().addEventListener('click', () => openPopup(map, coord, popupContent, onPopupOpen));

  if (startopen) openPopup(map, coord, popupContent, onPopupOpen);

  return marker;
}
