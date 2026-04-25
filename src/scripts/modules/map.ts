import * as wikipedia from './wikipedia.js';
import * as marker from './marker.js';
import * as search from './search.js';
import * as geolocation from './geolocation.js';
import { showBanner, hideBanner } from './banner.js';

const POPUP_STYLES = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap');
  /* Strip Google Maps InfoWindow chrome */
  .gm-style-iw-c {
    padding: 0 !important;
    border-radius: 3px !important;
    background: #fefcf0 !important;
    box-shadow: 2px 3px 10px rgba(0,0,0,0.18) !important;
  }
  .gm-style-iw-d {
    overflow: hidden !important;
    padding: 0 !important;
  }
  .og-popup {
    font-family: 'Caveat', cursive;
    font-size: 16px;
    line-height: 24px;
    color: #1a1a1a;
    max-width: 300px;
    min-width: 220px;
    border-radius: 3px;
    overflow: hidden;
  }
  /* Lined paper page */
  .og-popup__page {
    position: relative;
    background-color: #fefcf0;
    background-image: repeating-linear-gradient(
      transparent,
      transparent 23px,
      #daeaf7 23px,
      #daeaf7 24px
    );
    background-size: 100% 24px;
    background-position: 0 6px;
    padding: 6px 14px 14px 48px;
  }
  /* Red margin line */
  .og-popup__page::before {
    content: '';
    position: absolute;
    left: 36px;
    top: 0;
    bottom: 0;
    width: 1.5px;
    background: #e07070;
    opacity: 0.7;
  }
  /* Top row: badge + button */
  .og-popup__toprow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
  }
  /* Category sticker */
  .og-popup__badge {
    display: inline-block;
    background: var(--cat-color);
    color: #fff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    font-weight: bold;
    padding: 2px 8px;
    border-radius: 2px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    box-shadow: 1px 1px 3px rgba(0,0,0,0.25);
    white-space: nowrap;
  }
  .og-popup__title {
    margin: 0 0 4px;
    font-size: 20px;
    font-weight: 700;
    line-height: 24px;
    color: #111;
  }
  .og-popup__body {
    margin-bottom: 10px;
  }
  .og-popup__body p {
    margin: 0 0 8px;
  }
  .og-popup__body p:last-child {
    margin-bottom: 0;
  }
  .og-popup__body--empty {
    color: #888;
    font-style: italic;
  }
  .og-popup__btn {
    display: inline-block;
    background: var(--cat-color);
    color: #fff;
    text-decoration: none;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    font-weight: bold;
    padding: 2px 8px;
    border-radius: 2px;
    letter-spacing: 0.03em;
    box-shadow: 1px 1px 3px rgba(0,0,0,0.25);
    white-space: nowrap;
  }
  .og-popup__btn:hover {
    opacity: 0.85;
  }
</style>`;

function buildPopupContent(coord: wikipedia.WikiArticle): string {
  const style = marker.CATEGORY_STYLE[coord.category] ?? marker.CATEGORY_STYLE.default;
  const wikiUrl = `https://en.wikipedia.org/?curid=${coord.pageId}`;
  const categoryLabel = coord.category
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  const badge = `<span class="og-popup__badge">${style.glyph} ${categoryLabel}</span>`;
  const bodyHtml = coord.extract ?? '<p>No description available.</p>';
  const bodyClass = coord.extract ? 'og-popup__body' : 'og-popup__body og-popup__body--empty';

  return `${POPUP_STYLES}
<div class="og-popup" style="--cat-color:${style.color}">

  <div class="og-popup__page">
    <div class="og-popup__toprow">
      ${badge}
      <a class="og-popup__btn" href="${wikiUrl}" target="_blank" rel="noopener noreferrer">Read on Wikipedia</a>
    </div>
    <h3 class="og-popup__title">${coord.title}</h3>
    <div class="${bodyClass}">${bodyHtml}</div>
  </div>
</div>`;
}

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
      buildPopupContent(coord),
      markerLocal.getCategoryIcon(coord.category)
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
    `${POPUP_STYLES}
<div class="og-popup" style="--cat-color:#1A73E8">

  <div class="og-popup__page">
    <span class="og-popup__badge">📍 You are here</span>
    <h3 class="og-popup__title">Welcome to OurGaia!</h3>
    <div class="og-popup__body">
      <p>OurGaia places Wikipedia landmarks on the map around you — museums, parks, historic sites, transit stops, and more, each with its own colour and icon.</p>
      <p>Pan or zoom to explore a new area, use the search bar to jump to any city or address, or click any marker to read about it.</p>
    </div>
  </div>
</div>`,
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
