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
  church:    { color: '#5C6BC0', glyph: '⛪' },
  park:      { color: '#388E3C', glyph: '🌳' },
  historic:  { color: '#795548', glyph: '🏰' },
  education: { color: '#0288D1', glyph: '🎓' },
  transport: { color: '#F57C00', glyph: '🚉' },
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
