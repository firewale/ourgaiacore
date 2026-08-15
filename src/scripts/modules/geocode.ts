const apiUrl = '/api/geocode';

export type NominatimStatus = 'ok' | 'not-found' | 'rate-limited' | 'error';

export interface NominatimPlace {
  latitude: number;
  longitude: number;
  displayName: string;
}

export interface NominatimSearchResult {
  status: NominatimStatus;
  places?: NominatimPlace[]; // present only when status === 'ok'; at least one entry
}

export interface NominatimReverseResult {
  status: NominatimStatus;
  place?: NominatimPlace; // present only when status === 'ok'
}

// Search cache keyed by normalized query text; reverse cache keyed by lat/lng
// rounded to 5 decimal places (~1.1m) since reverse lookups are address-level.
const searchCache = new Map<string, NominatimSearchResult>();
const reverseCache = new Map<string, NominatimReverseResult>();

export function clearCache(): void {
  searchCache.clear();
  reverseCache.clear();
}

export async function searchAddress(query: string): Promise<NominatimSearchResult> {
  const key = query.trim().toLowerCase();
  if (searchCache.has(key)) return searchCache.get(key)!;

  const params = new URLSearchParams({ q: query });

  let apiRes: Response;
  try {
    apiRes = await fetch(`${apiUrl}/search?${params}`);
  } catch (err) {
    console.error('Geocode search request failed:', err);
    return { status: 'error' };
  }

  if (apiRes.status === 429) return { status: 'rate-limited' };
  if (!apiRes.ok) { console.error('Geocode search API error:', apiRes.status); return { status: 'error' }; }

  let data: { results: Array<{ lat: number; lon: number; displayName: string }> };
  try {
    data = await apiRes.json();
  } catch (err) {
    console.error('Geocode search parse error:', err);
    return { status: 'error' };
  }

  const places = data.results.map((r) => ({ latitude: r.lat, longitude: r.lon, displayName: r.displayName }));
  const result: NominatimSearchResult = places.length > 0
    ? { status: 'ok', places }
    : { status: 'not-found' };

  searchCache.set(key, result);
  return result;
}

export async function reverseGeocode(lat: number, lng: number): Promise<NominatimReverseResult> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (reverseCache.has(key)) return reverseCache.get(key)!;

  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });

  let apiRes: Response;
  try {
    apiRes = await fetch(`${apiUrl}/reverse?${params}`);
  } catch (err) {
    console.error('Geocode reverse request failed:', err);
    return { status: 'error' };
  }

  if (apiRes.status === 429) return { status: 'rate-limited' };
  if (!apiRes.ok) { console.error('Geocode reverse API error:', apiRes.status); return { status: 'error' }; }

  let data: { result: { lat: number; lon: number; displayName: string } | null };
  try {
    data = await apiRes.json();
  } catch (err) {
    console.error('Geocode reverse parse error:', err);
    return { status: 'error' };
  }

  const result: NominatimReverseResult = data.result
    ? { status: 'ok', place: { latitude: data.result.lat, longitude: data.result.lon, displayName: data.result.displayName } }
    : { status: 'not-found' };

  reverseCache.set(key, result);
  return result;
}
