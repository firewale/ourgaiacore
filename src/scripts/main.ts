/// <reference types="vite/client" />
import '../styles/main.css';
import * as geolocation from './modules/geolocation.js';
import * as marker from './modules/marker.js';
import * as wikipedia from './modules/wikipedia.js';
import * as search from './modules/search.js';
import * as map from './modules/map.js';

async function initMap(): Promise<void> {
  const latLng = await geolocation.getCurrentPosition();
  map.initialize(latLng, marker, wikipedia, search);
}

(window as unknown as { initMap: () => Promise<void> }).initMap = initMap;

const script = document.createElement('script');
script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&callback=initMap`;
script.defer = true;
document.head.appendChild(script);
