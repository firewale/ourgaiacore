import * as wikipedia from './wikipedia.js';
import * as marker from './marker.js';
import * as search from './search.js';
import * as geolocation from './geolocation.js';

export let mapInitialized = false;
let map: google.maps.Map;
let wikipediaLocal: typeof wikipedia;
let markerLocal: typeof marker;

export function initialize(
  latLng: google.maps.LatLng,
  markerMod: typeof marker,
  wikipediaMod: typeof wikipedia,
  searchMod: typeof search
): void {
  wikipediaLocal = wikipediaMod;
  markerLocal = markerMod;

  const mapOptions: google.maps.MapOptions = {
    zoom: 14,
    center: latLng,
    mapTypeId: google.maps.MapTypeId.TERRAIN,
  };

  map = new google.maps.Map(
    document.getElementById('map') as HTMLElement,
    mapOptions
  );

  mapInitialized = true;

  void setPosition(latLng);
  setupClickEvents();
  setupCustomControls(searchMod);
}

export function plotLandmarks(results: Record<number, wikipedia.WikiArticle>): void {
  Object.values(results).forEach((coord) => {
    const latLng = new google.maps.LatLng(coord.lat, coord.long);
    markerLocal.placeMapMarker(
      map,
      latLng,
      coord.title,
      coord.extract,
      markerLocal.getCircleIcon('red')
    );
  });
}

export function setMapOrigin(latLng: google.maps.LatLng): void {
  map.setCenter(latLng);
  const icon = markerLocal.getCircleIcon('blue');
  markerLocal.placeMapMarker(
    map,
    latLng,
    'You are here!',
    'Welcome to OurGaia! The various icons on the map indicate points of interest. Start clicking to explore!',
    icon,
    true
  );
}

export async function setPosition(latLng: google.maps.LatLng): Promise<void> {
  if (!mapInitialized) initialize(latLng, markerLocal, wikipediaLocal, search);
  setMapOrigin(latLng);
  await wikipediaLocal.getWikipediaData(latLng, plotLandmarks);
}

function setupClickEvents(): void {
  google.maps.event.addListener(map, 'idle', () => void handleMapMove());
}

async function handleMapMove(): Promise<void> {
  const newCenter = map.getCenter();
  if (newCenter) {
    await wikipediaLocal.getWikipediaData(newCenter, plotLandmarks);
  }
}

function setupCustomControls(searchMod: typeof search): void {
  const homeDiv = document.createElement('div') as HTMLDivElement;
  homeDiv.id = 'homeDiv';

  searchMod.BuildSearchControl(homeDiv, geolocation, setPosition);

  (homeDiv as HTMLDivElement & { index: number }).index = 1;
  map.controls[google.maps.ControlPosition.TOP_CENTER].push(homeDiv);
}
