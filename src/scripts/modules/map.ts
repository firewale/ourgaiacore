import * as wikipedia from './wikipedia.js';
import * as marker from './marker.js';
import * as search from './search.js';
import * as geolocation from './geolocation.js';
import { showBanner, hideBanner } from './banner.js';

export let mapInitialized = false;
let map: google.maps.Map;
let wikipediaLocal: typeof wikipedia;
let markerLocal: typeof marker;
let idleDebounce: ReturnType<typeof setTimeout> | undefined;

export function initialize(
  latLng: google.maps.LatLng,
  markerMod: typeof marker,
  wikipediaMod: typeof wikipedia,
  searchMod: typeof search,
  mapId: string = 'DEMO_MAP_ID'
): void {
  wikipediaLocal = wikipediaMod;
  markerLocal = markerMod;

  const mapOptions: google.maps.MapOptions = {
    zoom: 14,
    center: latLng,
    mapTypeId: google.maps.MapTypeId.TERRAIN,
    mapId,
  };

  map = new google.maps.Map(
    document.getElementById('map') as HTMLElement,
    mapOptions
  );

  mapInitialized = true;

  setMapOrigin(latLng);
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
      coord.extract ?? `<strong>${coord.title}</strong><br><em>No description available.</em>`,
      markerLocal.getCircleIcon('red')
    );
  });
}

export function setMapOrigin(latLng: google.maps.LatLng): void {
  map.setCenter(latLng);
  const pin = markerLocal.getCircleIcon('blue');
  markerLocal.placeMapMarker(
    map,
    latLng,
    'You are here!',
    `<h3 style="margin:0 0 8px">Welcome to OurGaia!</h3>
<p style="margin:0 0 6px">Your blue marker shows your current location. The red markers around you are points of interest pulled live from Wikipedia.</p>
<p style="margin:0">Click any marker to read about it, use the search bar to jump to any city or address, or simply pan the map to explore a new area.</p>`,
    pin,
    true
  );
}

// Called from search — pans the map and lets the idle event handle the Wikipedia fetch.
export function setPosition(latLng: google.maps.LatLng): void {
  if (!mapInitialized) initialize(latLng, markerLocal, wikipediaLocal, search);
  setMapOrigin(latLng);
}

function setupClickEvents(): void {
  // Debounce idle so rapid panning/zooming doesn't flood the Wikipedia API.
  google.maps.event.addListener(map, 'idle', () => {
    clearTimeout(idleDebounce);
    idleDebounce = setTimeout(() => void fetchWikipediaForCurrentView(), 800);
  });
}

async function fetchWikipediaForCurrentView(): Promise<void> {
  const center = map.getCenter();
  if (!center) return;
  const status = await wikipediaLocal.getWikipediaData(center, plotLandmarks);
  if (status === 'rate-limited') {
    showBanner('Wikipedia is rate limiting requests — please wait 5 minutes before exploring further.', 300000);
  } else {
    hideBanner();
  }
}

function setupCustomControls(searchMod: typeof search): void {
  const homeDiv = document.createElement('div') as HTMLDivElement;
  homeDiv.id = 'homeDiv';

  searchMod.BuildSearchControl(homeDiv, geolocation, setPosition);

  (homeDiv as HTMLDivElement & { index: number }).index = 1;
  map.controls[google.maps.ControlPosition.TOP_CENTER].push(homeDiv);
}
