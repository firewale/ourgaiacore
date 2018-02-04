export var isInitialized = true;

export function getCircleIcon(color) {
    return {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: color || 'red',
        fillOpacity: .7,
        scale: 5,
        strokeColor: 'white',
        strokeWeight: .5
    };
}

export function placeMapMarker(map, latLng, title, popupContent, icon, startopen) {
    var marker = new google.maps.Marker({
        position: latLng,
        map: map,
        title: title,
        icon: icon
    });

    if (popupContent === undefined) return;

    var infowindow = new google.maps.InfoWindow({
        content: popupContent
    });

    //Add click callback to open infowindow popup on click of the marker
    google.maps.event.addListener(marker, 'click', function () {
        infowindow.open(map, marker);
    });

    if (startopen !== undefined && startopen)
        infowindow.open(map, marker);

    return marker;
}