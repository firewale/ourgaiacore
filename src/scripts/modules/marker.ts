import type { ArticleCategory } from './wikipedia.js';

export function getCircleIcon(color: string = 'red'): google.maps.marker.PinElement {
  return new google.maps.marker.PinElement({
    background: color,
    borderColor: 'white',
    glyphColor: 'white',
  });
}

const CATEGORY_STYLE: Record<ArticleCategory, { color: string; glyph: string }> = {
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

export function getCategoryIcon(category: ArticleCategory = 'default'): google.maps.marker.PinElement {
  const style = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.default;
  return new google.maps.marker.PinElement({
    background: style.color,
    borderColor: 'white',
    glyphColor: 'white',
    glyphText: style.glyph,
  });
}

export function placeMapMarker(
  map: google.maps.Map,
  latLng: google.maps.LatLng,
  title: string,
  popupContent?: string,
  pin?: google.maps.marker.PinElement,
  startopen?: boolean
): google.maps.marker.AdvancedMarkerElement {
  const marker = new google.maps.marker.AdvancedMarkerElement({
    position: latLng,
    map,
    title,
    content: pin,
    gmpClickable: popupContent !== undefined,
  });

  if (popupContent === undefined) return marker;

  const infowindow = new google.maps.InfoWindow({ content: popupContent });

  marker.addEventListener('gmp-click', () => {
    infowindow.open({ anchor: marker, map });
  });

  if (startopen) infowindow.open({ anchor: marker, map });

  return marker;
}
