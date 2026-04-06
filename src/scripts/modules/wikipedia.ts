const apiUrl = '/api/wikipedia';

export interface WikiArticle {
  title: string;
  lat: number;
  long: number;
  pageId: number;
  extract?: string;
}

// Cache keyed by lat/lng rounded to 2 decimal places (~1.1km grid cells).
// This prevents re-fetching when the map is panned only slightly or revisits an area.
const cache = new Map<string, Record<number, WikiArticle>>();

function cacheKey(latLng: google.maps.LatLng): string {
  return `${latLng.lat().toFixed(2)},${latLng.lng().toFixed(2)}`;
}

export function clearCache(): void {
  cache.clear();
}

export type WikiDataStatus = 'ok' | 'rate-limited' | 'error';

export async function getWikipediaData(
  latLng: google.maps.LatLng,
  callback: (results: Record<number, WikiArticle>) => void
): Promise<WikiDataStatus> {
  const key = cacheKey(latLng);
  if (cache.has(key)) {
    callback(cache.get(key)!);
    return 'ok';
  }

  const lat = latLng.lat();
  const lng = latLng.lng();

  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });

  let apiRes: Response;
  try {
    apiRes = await fetch(`${apiUrl}?${params}`);
  } catch (err) {
    console.error('Wikipedia API request failed:', err);
    return 'error';
  }

  if (apiRes.status === 429) return 'rate-limited';
  if (!apiRes.ok) { console.error('Wikipedia API error:', apiRes.status); return 'error'; }

  let items: Record<number, WikiArticle>;
  try {
    items = await apiRes.json() as Record<number, WikiArticle>;
  } catch (err) {
    console.error('Wikipedia API parse error:', err);
    return 'error';
  }

  cache.set(key, items);
  callback(items);
  return 'ok';
}
