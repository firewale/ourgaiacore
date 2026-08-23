/// <reference types="vite/client" />
import '../styles/main.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { setWorkerUrl } from 'maplibre-gl';
import * as geolocation from './modules/geolocation.js';
import * as marker from './modules/marker.js';
import * as wikipedia from './modules/wikipedia.js';
import * as search from './modules/search.js';
import * as map from './modules/map.js';
import * as categories from './modules/categories.js';

// MapLibre's own worker-URL auto-detection breaks under both Vite's dev-server
// dependency pre-bundling and Rollup's production build (the worker's sibling
// chunk doesn't get copied). Point it at our own copy instead — see
// scripts/copy-maplibre-worker.mjs.
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

async function initMap(): Promise<void> {
  // A same-origin, near-instant fetch — worth awaiting so the legend and the
  // first markers render with the real category list (built-ins plus any
  // user-added ones) rather than the built-in fallback. Unlike geolocation
  // below, this isn't a multi-second wait, so blocking on it is fine.
  await categories.loadCategories();

  // Render immediately at a default location rather than blocking on
  // geolocation — which can take several seconds or the full 15s timeout —
  // then silently recenter once (if) the real location resolves.
  map.initialize(geolocation.DEFAULT_COORDINATE, marker, wikipedia, search, import.meta.env.VITE_MAP_STYLE_URL);
  const coord = await geolocation.getCurrentPosition();
  map.recenterToUserLocation(coord);
}

void initMap();
