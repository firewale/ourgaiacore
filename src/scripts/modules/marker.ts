export function getCircleIcon(color: string = 'red'): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 0.7,
    scale: 5,
    strokeColor: 'white',
    strokeWeight: 0.5,
  };
}

export function placeMapMarker(
  map: google.maps.Map,
  latLng: google.maps.LatLng,
  title: string,
  popupContent?: string,
  icon?: google.maps.Symbol,
  startopen?: boolean
): google.maps.Marker {
  const marker = new google.maps.Marker({
    position: latLng,
    map,
    title,
    icon,
  });

  if (popupContent === undefined) return marker;

  const infowindow = new google.maps.InfoWindow({ content: popupContent });

  google.maps.event.addListener(marker, 'click', () => {
    infowindow.open(map, marker);
  });

  if (startopen) infowindow.open(map, marker);

  return marker;
}
