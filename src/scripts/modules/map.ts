import { MapLibreMap, type Marker, type IControl } from 'maplibre-gl';
import * as wikipedia from './wikipedia.js';
import * as marker from './marker.js';
import * as search from './search.js';
import * as geolocation from './geolocation.js';
import type { Coordinate, Bounds } from './coordinate.js';
import { toLngLat } from './coordinate.js';
import { showBanner, hideBanner } from './banner.js';
import { buildLegend, collapseLegend } from './legend.js';
import * as chat from './chat.js';
import * as mapContext from './mapContext.js';
import * as loadingBar from './loadingBar.js';
import * as categories from './categories.js';

const POPUP_STYLES = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap');
  /* MapLibre's default popup chrome adds a white padded frame around whatever
     content we give it; strip that so .og-popup's own card fills the popup. */
  .maplibregl-popup-content {
    padding: 0;
    background: transparent;
    box-shadow: none;
  }
  .maplibregl-popup-anchor-top .maplibregl-popup-tip,
  .maplibregl-popup-anchor-top-left .maplibregl-popup-tip,
  .maplibregl-popup-anchor-top-right .maplibregl-popup-tip {
    border-bottom-color: #fefcf0;
  }
  .maplibregl-popup-anchor-bottom .maplibregl-popup-tip,
  .maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip,
  .maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip {
    border-top-color: #fefcf0;
  }
  .maplibregl-popup-anchor-left .maplibregl-popup-tip {
    border-right-color: #fefcf0;
  }
  .maplibregl-popup-anchor-right .maplibregl-popup-tip {
    border-left-color: #fefcf0;
  }
  .og-popup {
    font-family: 'Caveat', cursive;
    font-size: 16px;
    line-height: 24px;
    color: #1a1a1a;
    max-width: min(380px, 90vw);
    min-width: 220px;
    border-radius: 3px;
    overflow: hidden;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
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
    background-position: 0 22px;
    padding: 16px 14px 14px 48px;
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
  /* Top row: full-width header strip */
  .og-popup__toprow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #faf3e8;
    border-radius: 3px 3px 0 0;
    margin: -16px -14px 8px -48px;
    padding: 8px 12px 8px 48px;
  }
  /* Category sticker */
  .og-popup__heading {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .og-popup__glyph {
    font-size: 20px;
    line-height: 24px;
    flex-shrink: 0;
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
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    background: #fffef8;
    color: #333;
    text-decoration: none;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    font-weight: bold;
    height: 24px;
    padding: 0 12px;
    border-radius: 2px;
    letter-spacing: 0.03em;
    box-shadow: 1px 1px 3px rgba(0,0,0,0.25);
    white-space: nowrap;
  }
  .og-popup__btn:hover {
    background: #f5f5f5;
  }
  .og-popup__btn img {
    display: block;
  }
  .og-popup__close {
    display: inline-flex;
    align-items: center;
    margin: 0;
    background: #fffef8;
    color: #333;
    border: none;
    cursor: pointer;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    font-weight: bold;
    height: 24px;
    padding: 0 12px;
    border-radius: 2px;
    box-shadow: 1px 1px 3px rgba(0,0,0,0.25);
  }
  .og-popup__close:hover {
    background: #f5f5f5;
  }
  .og-popup__category-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: -2px 0 8px;
  }
  .og-popup__category-label {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #888;
  }
  .og-popup__category-edit-btn {
    background: none;
    border: none;
    padding: 1px 3px;
    margin: 0;
    cursor: pointer;
    font-size: 11px;
    line-height: 1;
    opacity: 0.6;
  }
  .og-popup__category-edit-btn:hover {
    opacity: 1;
  }
  .og-popup__category-select {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    padding: 2px 4px;
    border-radius: 2px;
    border: 1px solid #ccc;
    background: #fffef8;
    color: #333;
  }
  .og-popup__category-status {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    color: #888;
  }
</style>`;

function buildPopupContent(article: wikipedia.WikiArticle): string {
  const style = categories.getCategoryStyle(article.category);
  const wikiUrl = `https://en.wikipedia.org/?curid=${article.pageId}`;
  const bodyHtml = article.extract ?? '<p>No description available.</p>';
  const bodyClass = article.extract ? 'og-popup__body' : 'og-popup__body og-popup__body--empty';
  const categoryOptions = categories.getCategories()
    .map((cat) => `<option value="${cat.id}"${cat.id === article.category ? ' selected' : ''}>${cat.label}</option>`)
    .join('');

  return `${POPUP_STYLES}
<div class="og-popup" style="--cat-color:${style.color}">

  <div class="og-popup__page">
    <div class="og-popup__toprow">
      <a class="og-popup__btn" href="${wikiUrl}" target="_blank" rel="noopener noreferrer"><img src="https://en.wikipedia.org/static/favicon/wikipedia.ico" width="12" height="12" alt="">Read Article</a>
      <button class="og-popup__close">✕</button>
    </div>
    <div class="og-popup__heading">
      <span class="og-popup__glyph">${style.glyph}</span>
      <h3 class="og-popup__title">${article.title}</h3>
    </div>
    <div class="og-popup__category-row">
      <span class="og-popup__category-label">${style.label}</span>
      <button type="button" class="og-popup__category-edit-btn" aria-label="Edit category" title="Edit category">✏️</button>
      <select class="og-popup__category-select" aria-label="Category" hidden>${categoryOptions}</select>
      <span class="og-popup__category-status"></span>
    </div>
    <div class="${bodyClass}">${bodyHtml}</div>
  </div>
</div>`;
}

// Wires the category <select> in an already-open popup for `article` to
// persist edits via the API, then swaps the marker (icon/glyph/color and
// popup content all derive from `article.category`) to reflect the change.
// `article` is the same object referenced by wikipedia.ts's cache and
// mapContext's visible-articles list, so mutating `.category` here keeps
// both in sync without extra plumbing.
function wireCategoryEditor(popupEl: HTMLElement, article: wikipedia.WikiArticle): void {
  const label = popupEl.querySelector<HTMLElement>('.og-popup__category-label');
  const editBtn = popupEl.querySelector<HTMLButtonElement>('.og-popup__category-edit-btn');
  const select = popupEl.querySelector<HTMLSelectElement>('.og-popup__category-select');
  const status = popupEl.querySelector<HTMLElement>('.og-popup__category-status');
  if (!label || !editBtn || !select) return;

  const collapse = (): void => {
    select.hidden = true;
    label.hidden = false;
    editBtn.hidden = false;
  };

  editBtn.addEventListener('click', () => {
    label.hidden = true;
    editBtn.hidden = true;
    select.hidden = false;
    select.focus();
    select.showPicker?.();
  });

  // Most edits are opened, then abandoned without a change — collapse back to
  // the compact label instead of leaving the dropdown stuck open.
  select.addEventListener('blur', () => {
    if (select.value === article.category) collapse();
  });

  select.addEventListener('change', async () => {
    const previousCategory = article.category;
    const newCategory = select.value as wikipedia.ArticleCategory;
    if (status) status.textContent = 'Saving…';

    const ok = await wikipediaLocal.setArticleCategory(article.pageId, newCategory);
    if (!ok) {
      select.value = previousCategory;
      if (status) status.textContent = 'Failed to save';
      return;
    }

    article.category = newCategory;

    const entry = markerRegistry.get(article.pageId);
    if (entry) {
      entry.marker.remove();
      const coord: Coordinate = { lat: article.lat, lng: article.long };
      const newMarker = markerLocal.placeMapMarker(
        map,
        coord,
        article.title,
        buildPopupContent(article),
        markerLocal.getCategoryIcon(newCategory),
        true, // reopen the (shared) popup so the save confirmation stays visible
        (popupEl2) => {
          wireCategoryEditor(popupEl2, article);
          const statusEl = popupEl2.querySelector<HTMLElement>('.og-popup__category-status');
          if (statusEl) {
            statusEl.textContent = 'Saved';
            setTimeout(() => { statusEl.textContent = ''; }, 1500);
          }
        }
      );
      markerRegistry.set(article.pageId, { marker: newMarker, category: newCategory });
      if (hiddenCategories.has(newCategory)) newMarker.remove();
    }
  });
}

const WELCOME_POPUP_HTML = `${POPUP_STYLES}
<div class="og-popup" style="--cat-color:#1A73E8">

  <div class="og-popup__page">
    <div class="og-popup__toprow">
      <span></span>
      <button class="og-popup__close">✕</button>
    </div>
    <h3 class="og-popup__title">📍 Welcome to OurGaia!</h3>
    <div class="og-popup__body">
      <p>OurGaia places Wikipedia landmarks on the map around you — museums, parks, historic sites, transit stops, and more, each with its own colour and icon.</p>
      <p>Pan or zoom to explore a new area, use the search bar to jump to any city or address, or click any marker to read about it.</p>
    </div>
  </div>
</div>`;

const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// OpenFreeMap's "liberty" style lumps businesses/shops/parking icons into these
// ranked POI layers, plus a separate layer for bus/rail/airport icons — we hide
// all of them so the map only shows Wikipedia landmarks, not basemap clutter.
// Guarded with getLayer() since a custom VITE_MAP_STYLE_URL may not have these ids.
const HIDDEN_BASEMAP_POI_LAYERS = ['poi_r1', 'poi_r7', 'poi_r20', 'poi_transit'];

function hideBasemapPoiLayers(): void {
  for (const layerId of HIDDEN_BASEMAP_POI_LAYERS) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', 'none');
    }
  }
}

export let mapInitialized = false;
let map: MapLibreMap;
let wikipediaLocal: typeof wikipedia;
let markerLocal: typeof marker;
let idleDebounce: ReturnType<typeof setTimeout> | undefined;
let wikipediaRateLimited = false;
let originMarker: Marker | undefined;
let userInteracted = false;

const markerRegistry = new Map<number, { marker: Marker; category: wikipedia.ArticleCategory }>();
const hiddenCategories = new Set<wikipedia.ArticleCategory>();

function filterByCategories(hidden: Set<wikipedia.ArticleCategory>): void {
  markerRegistry.forEach(({ marker: m, category }) => {
    if (hidden.has(category)) {
      m.remove();
    } else {
      m.addTo(map);
    }
  });
}

class BottomLeftControl implements IControl {
  private container: HTMLDivElement | undefined;

  onAdd(): HTMLElement {
    const bottomLeftDiv = document.createElement('div');
    bottomLeftDiv.id = 'bottomLeftControls';
    // MapLibre's corner containers have pointer-events:none by default and only
    // re-enable clicks (pointer-events:auto) on elements carrying this class.
    bottomLeftDiv.className = 'maplibregl-ctrl';

    const legendDiv = document.createElement('div');
    legendDiv.id = 'legendDiv';
    buildLegend(legendDiv, (category, enabled) => {
      const cat = category as wikipedia.ArticleCategory;
      enabled ? hiddenCategories.delete(cat) : hiddenCategories.add(cat);
      filterByCategories(hiddenCategories);
    }, () => chat.collapseChat());
    bottomLeftDiv.appendChild(legendDiv);

    const chatDiv = document.createElement('div');
    chatDiv.id = 'chatDiv';
    chat.initialize(chatDiv, () => collapseLegend());
    bottomLeftDiv.appendChild(chatDiv);

    this.container = bottomLeftDiv;
    return bottomLeftDiv;
  }

  onRemove(): void {
    this.container?.remove();
    this.container = undefined;
  }
}

export function initialize(
  coord: Coordinate,
  markerMod: typeof marker,
  wikipediaMod: typeof wikipedia,
  searchMod: typeof search,
  styleUrl: string = DEFAULT_STYLE_URL
): void {
  wikipediaLocal = wikipediaMod;
  markerLocal = markerMod;

  map = new MapLibreMap({
    container: 'map',
    style: styleUrl,
    center: toLngLat(coord),
    zoom: 14,
  });

  mapInitialized = true;

  map.on('load', hideBasemapPoiLayers);
  setMapOrigin(coord);
  setupClickEvents();
  setupCustomControls(searchMod);
  setupInteractionTracking();
}

function setupInteractionTracking(): void {
  // `originalEvent` is only set for user-driven camera changes (mouse/touch/wheel),
  // not for our own programmatic setCenter() calls — this is how we tell the two apart.
  map.on('movestart', (e) => {
    if (e.originalEvent) userInteracted = true;
  });
}

// `results` represents the padded-viewport superset returned by the latest fetch
// (see wikipedia.ts's bounds padding), not a literal viewport-only set — a marker
// can briefly persist just past the visible edge until the pan clears the padded
// box too. That's intentional (it's what avoids re-fetching on small pans).
//
// Results arrive as a series of growing chunks (wikipedia.ts streams articles
// in as each batch resolves, rather than waiting for the whole viewport), so
// `results` may only be a partial picture while `isFinal` is false — markers
// are only ever added on a partial call, never removed, since a pageId that's
// merely not-yet-arrived isn't the same as one that's genuinely out of view.
// The final call (isFinal true) reconciles removals against the complete set.
export function plotLandmarks(results: Record<number, wikipedia.WikiArticle>, isFinal = true): void {
  mapContext.setVisibleArticles(Object.values(results));

  if (isFinal) {
    markerRegistry.forEach((entry, pageId) => {
      if (!(pageId in results)) {
        entry.marker.remove();
        markerRegistry.delete(pageId);
      }
    });
  }

  Object.values(results).forEach((article) => {
    if (markerRegistry.has(article.pageId)) return;

    const coord: Coordinate = { lat: article.lat, lng: article.long };
    const m = markerLocal.placeMapMarker(
      map,
      coord,
      article.title,
      buildPopupContent(article),
      markerLocal.getCategoryIcon(article.category),
      undefined,
      (popupEl) => wireCategoryEditor(popupEl, article)
    );
    markerRegistry.set(article.pageId, { marker: m, category: article.category });

    if (hiddenCategories.has(article.category)) {
      m.remove();
    }
  });
}

function placeOriginMarker(coord: Coordinate, startopen: boolean): void {
  originMarker?.remove();
  const pin = markerLocal.getCircleIcon('blue');
  originMarker = markerLocal.placeMapMarker(map, coord, 'You are here!', WELCOME_POPUP_HTML, pin, startopen);
}

export function setMapOrigin(coord: Coordinate): void {
  map.setCenter(toLngLat(coord));
  placeOriginMarker(coord, true);
}

// Called once geolocation resolves, to silently correct the map's initial
// placeholder position — skipped if the user has already started interacting
// with the map by then, so we never yank the view out from under them.
export function recenterToUserLocation(coord: Coordinate): void {
  if (userInteracted) return;
  map.setCenter(toLngLat(coord));
  placeOriginMarker(coord, false);
}

// Called from search — pans the map and lets the idle event handle the Wikipedia fetch.
export function setPosition(coord: Coordinate): void {
  if (!mapInitialized) initialize(coord, markerLocal, wikipediaLocal, search);
  userInteracted = true;
  map.setZoom(14);
  setMapOrigin(coord);
  chat.newChat();
}

function setupClickEvents(): void {
  // Debounce idle so rapid panning/zooming doesn't flood the Wikipedia API.
  map.on('idle', () => {
    clearTimeout(idleDebounce);
    idleDebounce = setTimeout(() => void fetchWikipediaForCurrentView(), 800);
  });
}

async function fetchWikipediaForCurrentView(): Promise<void> {
  const mapBounds = map.getBounds();
  const bounds: Bounds = {
    north: mapBounds.getNorth(),
    south: mapBounds.getSouth(),
    east: mapBounds.getEast(),
    west: mapBounds.getWest(),
  };
  loadingBar.beginLoading();
  try {
    const status = await wikipediaLocal.getWikipediaData(bounds, plotLandmarks);
    if (status === 'rate-limited') {
      wikipediaRateLimited = true;
      showBanner('Wikipedia is rate limiting requests — please wait 5 minutes before exploring further.', 300000);
    } else if (wikipediaRateLimited) {
      // Only clear the banner if it's the one we showed — an unrelated banner
      // (e.g. a geolocation notice) may be up and shouldn't be dismissed by this.
      wikipediaRateLimited = false;
      hideBanner();
    }
  } finally {
    // Always stopped here (not just on the isFinal plotLandmarks call) so a
    // rate-limited or errored fetch — which never reaches isFinal — doesn't
    // leave the bar spinning forever.
    loadingBar.endLoading();
  }
}

function setupCustomControls(searchMod: typeof search): void {
  const homeDiv = document.createElement('div');
  homeDiv.id = 'homeDiv';
  homeDiv.className = 'map-search-overlay';

  searchMod.BuildSearchControl(homeDiv, geolocation, setPosition);

  map.getContainer().appendChild(homeDiv);

  map.addControl(new BottomLeftControl(), 'bottom-left');
}

export function _resetMapStateForTests(): void {
  mapInitialized = false;
  markerRegistry.clear();
  hiddenCategories.clear();
  wikipediaRateLimited = false;
  originMarker = undefined;
  userInteracted = false;
  clearTimeout(idleDebounce);
  idleDebounce = undefined;
  loadingBar._resetLoadingBarForTests();
}
