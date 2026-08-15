import type { Coordinate } from './coordinate.js';

const apiUrl = '/api/wikipedia';

export type ArticleCategory =
  | 'museum' | 'worship' | 'park' | 'historic'
  | 'education' | 'transport' | 'city' | 'demolished' | 'shopping' | 'ghost-town' | 'waterway' | 'neighborhood' | 'plane-crash' | 'hospital' | 'landform' | 'urban-legend' | 'food-and-drink' | 'art' | 'natural-disaster' | 'sport' | 'infrastructure' | 'event' | 'industry' | 'community' | 'maritime' | 'tech' | 'performing-arts' | 'trail' | 'recording-studio' | 'entertainment' | 'default';

export interface WikiArticle {
  title: string;
  lat: number;
  long: number;
  pageId: number;
  extract?: string;
  category: ArticleCategory;
}

// Cache keyed by lat/lng rounded to 2 decimal places (~1.1km grid cells).
// This prevents re-fetching when the map is panned only slightly or revisits an area.
const cache = new Map<string, Record<number, WikiArticle>>();

function cacheKey(coord: Coordinate, zoom: number): string {
  return `${coord.lat.toFixed(2)},${coord.lng.toFixed(2)},${zoom}`;
}

export function clearCache(): void {
  cache.clear();
}

export type WikiDataStatus = 'ok' | 'rate-limited' | 'error';

export async function getWikipediaData(
  coord: Coordinate,
  zoom: number,
  callback: (results: Record<number, WikiArticle>) => void
): Promise<WikiDataStatus> {
  const key = cacheKey(coord, zoom);
  if (cache.has(key)) {
    callback(cache.get(key)!);
    return 'ok';
  }

  const params = new URLSearchParams({ lat: String(coord.lat), lng: String(coord.lng), zoom: String(zoom) });

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
