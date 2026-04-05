export function getCircleIcon(color: string = 'red'): google.maps.marker.PinElement {
  return new google.maps.marker.PinElement({
    background: color,
    borderColor: 'white',
    glyphColor: 'white',
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
