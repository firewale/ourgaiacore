export var mapInitialized = false;
var map;
var wikipediaLocal;
var markerLocal;

//Initialize the map control onto to the canvas
export function initialize(latLng, marker, wikipedia, search, geolocation) {
    //mapCenter = position;

    wikipediaLocal = wikipedia;
    markerLocal = marker;

    var mapOptions = {
        zoom: 14,
        center: latLng,
        mapTypeId: google.maps.MapTypeId.TERRAIN
    };

    map = new google.maps.Map(document.getElementById('map'),
        mapOptions);

    mapInitialized = true;

    setPosition(latLng);

    setupClickEvents();

    setupCustomControls(search, geolocation);

    /*setupLegend();

    UserMarkerModule.initialize();*/
}

export function plotLandmarks(results) {
    var $ = window.jQuery;
    
    //foreach item of interest in the array create a marker on the map with a popup with the extract
    $.each(results, function (i, coord) {
        var latLng = new google.maps.LatLng(coord.lat, coord.long);

        //Place a google maps marker for each point of interest
        //markerLocal.placeMapMarker(map, latLng, coord.title, coord.extract, wikipediaLocal.getWikipediaMarker());
        markerLocal.placeMapMarker(map, latLng, coord.title, coord.extract, markerLocal.getCircleIcon('red'));
    });
}

export function setMapOrigin(latLng) {
    map.setCenter(latLng);
    var icon = markerLocal.getCircleIcon('blue');
    markerLocal.placeMapMarker(map, latLng, 'You are here!', 'Welcome to OurGaia! The various icons on the map indicate points of interest. Start clicking to explore!', icon, true);
}

export function setPosition(latLng) {
    
    if (!mapInitialized) {
        initialize(latLng);
    }
   
    setMapOrigin(latLng);
    
    //alert('lat: ' + latLng.lat() + 'long:' + latLng.lng());

    wikipediaLocal.getWikipediaData(latLng, plotLandmarks);
}

function setupClickEvents() {
    //google.maps.event.addListener(map, 'rightclick', handleRightClick);

    google.maps.event.addListener(map, 'idle', handleMapMove);

    //new LongPress(map, 500);
    //google.maps.event.addListener(map, 'longpress', handleRightClick);
}

function handleMapMove() {
    var newCenter = map.getCenter();

    wikipediaLocal.getWikipediaData(newCenter, plotLandmarks);

    /*if (newCenter.B !== undefined && Math.abs(newCenter.B - mapCenter.B) > 0.1)
        wikipediaLocal.getWikipediaData(mapCenter, MapModule.plot);

    if (newCenter.k !== undefined && Math.abs(newCenter.k - mapCenter.k) > 0.1)
        wikipediaLocal.getWikipediaData(newCenter, MapModule.plot);
        */
}

//TODO decouple this logic
/*function handleRightClick(evt) {
    UserMarkerModule.addUserMarker(evt.latLng);
}*/

function setupCustomControls(search, geolocation) {
    var homeDiv = document.createElement('div');
    homeDiv.id = 'homeDiv';

    search.BuildSearchControl(homeDiv, geolocation, setPosition);

    homeDiv.index = 1;
    map.controls[google.maps.ControlPosition.TOP].push(homeDiv);
}