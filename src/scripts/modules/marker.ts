import { Marker, Popup, type MapLibreMap } from 'maplibre-gl';
import type { ArticleCategory } from './wikipedia.js';
import type { Coordinate } from './coordinate.js';
import { toLngLat } from './coordinate.js';

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

export const CATEGORY_STYLE: Record<ArticleCategory, { color: string; glyph: string }> = {
  museum:    { color: '#9C27B0', glyph: '🏛' },
  worship:   { color: '#5C6BC0', glyph: '⛪' },
  park:      { color: '#388E3C', glyph: '🌳' },
  historic:  { color: '#795548', glyph: '🏰' },
  education: { color: '#0288D1', glyph: '🎓' },
  transport: { color: '#F57C00', glyph: '🚉' },
  city:      { color: '#00897B', glyph: '🏙' },
  demolished: { color: '#616161', glyph: '🏚' },
  shopping:  { color: '#E91E63', glyph: '🛍' },
  'ghost-town': { color: '#4A148C', glyph: '👻' },
  waterway:  { color: '#0277BD', glyph: '🌊' },
  neighborhood: { color: '#FF8F00', glyph: '🏘' },
  'plane-crash': { color: '#B71C1C', glyph: '✈' },
  hospital:  { color: '#00838F', glyph: '🏥' },
  landform:  { color: '#6D4C41', glyph: '⛰' },
  'urban-legend': { color: '#4527A0', glyph: '🔮' },
  'food-and-drink': { color: '#EF6C00', glyph: '🍽' },
  art:       { color: '#AD1457', glyph: '🎨' },
  'natural-disaster': { color: '#E65100', glyph: '⚡' },
  sport:     { color: '#2E7D32', glyph: '🎾' },
  infrastructure: { color: '#455A64', glyph: '⚙' },
  event:     { color: '#7B1FA2', glyph: '🎉' },
  industry:  { color: '#5D4037', glyph: '🏭' },
  community: { color: '#00695C', glyph: '🤝' },
  maritime:  { color: '#01579B', glyph: '⚓' },
  tech:      { color: '#1565C0', glyph: '💻' },
  'performing-arts': { color: '#880E4F', glyph: '🎭' },
  trail:     { color: '#558B2F', glyph: '🥾' },
  'recording-studio': { color: '#4A148C', glyph: '🎙' },
  entertainment: { color: '#F9A825', glyph: '🎰' },
  default:   { color: '#546E7A', glyph: '?' },
};

export function getCategoryIcon(category: ArticleCategory = 'default'): HTMLElement {
  const style = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.default;
  return buildPinElement(style.color, style.glyph);
}

let sharedPopup: Popup | null = null;

function getSharedPopup(): Popup {
  if (!sharedPopup) {
    sharedPopup = new Popup({ closeButton: false, closeOnClick: false });
  }
  return sharedPopup;
}

export function _resetSharedPopup(): void {
  sharedPopup = null;
}

function openPopup(map: MapLibreMap, coord: Coordinate, popupContent: string): void {
  const popup = getSharedPopup();
  popup.setLngLat(toLngLat(coord)).setHTML(popupContent).addTo(map);
  popup.getElement()?.querySelector('.og-popup__close')?.addEventListener('click', () => {
    popup.remove();
  });
}

export function placeMapMarker(
  map: MapLibreMap,
  coord: Coordinate,
  title: string,
  popupContent?: string,
  pin?: HTMLElement,
  startopen?: boolean
): Marker {
  const marker = new Marker(pin ? { element: pin, anchor: 'bottom' } : { anchor: 'bottom' })
    .setLngLat(toLngLat(coord))
    .addTo(map);
  marker.getElement().title = title;

  if (popupContent === undefined) return marker;

  marker.getElement().addEventListener('click', () => openPopup(map, coord, popupContent));

  if (startopen) openPopup(map, coord, popupContent);

  return marker;
}
