import { searchPlaces } from '../lib/geocode.js';
import { isMapOpen, publish, unknownMapError } from '../lib/mapEvents.js';

export const DEFAULT_ZOOM = 14;

export type GoToPlaceResult =
  | { ok: true; lat: number; lng: number; zoom: number; displayName: string }
  | { ok: false; error: string };

// Version-independent core of the go_to_place tool. Each MCP version
// (tools/v1.ts, tools/v2.ts) only adapts its own input/output contract to this.
// Only the map named by mapId moves; an unknown id fails before geocoding.
export async function goToPlace(mapId: string, query: string, zoom = DEFAULT_ZOOM): Promise<GoToPlaceResult> {
  if (!isMapOpen(mapId)) return { ok: false, error: unknownMapError(mapId) };

  const search = await searchPlaces(query);
  if (search.status === 'rate-limited') {
    return { ok: false, error: 'The geocoder is rate limiting requests — try again in a moment.' };
  }
  if (search.status === 'error') {
    return { ok: false, error: 'The geocoder is unavailable right now.' };
  }

  const [place] = search.results;
  if (!place) return { ok: false, error: `No place found matching "${query}".` };

  // The tab may have closed while the geocoder was answering.
  if (!publish(mapId, { type: 'navigate', lat: place.lat, lng: place.lon, zoom, displayName: place.displayName })) {
    return { ok: false, error: unknownMapError(mapId) };
  }

  return { ok: true, lat: place.lat, lng: place.lon, zoom, displayName: place.displayName };
}
