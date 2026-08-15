/// <reference types="vite/client" />
import '../styles/main.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { setWorkerUrl } from 'maplibre-gl';
import * as geolocation from './modules/geolocation.js';
import * as marker from './modules/marker.js';
import * as wikipedia from './modules/wikipedia.js';
import * as search from './modules/search.js';
import * as map from './modules/map.js';

// MapLibre's own worker-URL auto-detection breaks under both Vite's dev-server
// dependency pre-bundling and Rollup's production build (the worker's sibling
// chunk doesn't get copied). Point it at our own copy instead — see
// scripts/copy-maplibre-worker.mjs.
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

async function initMap(): Promise<void> {
  const coord = await geolocation.getCurrentPosition();
  map.initialize(coord, marker, wikipedia, search, import.meta.env.VITE_MAP_STYLE_URL);
}

void initMap();
