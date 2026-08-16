import type { Bounds } from './coordinate.js';

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

// Cache of previously fetched (padded, rounded) boxes and their results. A new
// request is served from cache if its raw viewport bounds fall entirely within
// an already-fetched box — not just on exact match — so zooming in (which shrinks
// the box) still hits the cache instead of re-fetching, as long as the smaller
// box is still covered by a wider box fetched moments ago.
interface CacheEntry { bounds: Bounds; results: Record<number, WikiArticle>; }
const cache: CacheEntry[] = [];

function padBounds(b: Bounds, factor = 0.5): Bounds {
  const latPad = (b.north - b.south) * factor;
  const lngPad = (b.east - b.west) * factor;
  return {
    north: b.north + latPad,
    south: b.south - latPad,
    east: b.east + lngPad,
    west: b.west - lngPad,
  };
}

// Rounding to ~1.1km grid cells keeps the outgoing request (and thus the server's
// Redis cache key) stable across near-identical boxes from different sessions.
function roundBounds(b: Bounds): Bounds {
  return {
    north: Number(b.north.toFixed(2)),
    south: Number(b.south.toFixed(2)),
    east: Number(b.east.toFixed(2)),
    west: Number(b.west.toFixed(2)),
  };
}

function contains(outer: Bounds, inner: Bounds): boolean {
  return inner.north <= outer.north && inner.south >= outer.south
    && inner.east <= outer.east && inner.west >= outer.west;
}

export function clearCache(): void {
  cache.length = 0;
}

export type WikiDataStatus = 'ok' | 'rate-limited' | 'error';

export async function getWikipediaData(
  bounds: Bounds,
  callback: (results: Record<number, WikiArticle>) => void
): Promise<WikiDataStatus> {
  const cached = cache.find((entry) => contains(entry.bounds, bounds));
  if (cached) {
    callback(cached.results);
    return 'ok';
  }

  const rounded = roundBounds(padBounds(bounds));
  const params = new URLSearchParams({
    north: String(rounded.north),
    south: String(rounded.south),
    east: String(rounded.east),
    west: String(rounded.west),
  });

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

  cache.push({ bounds: rounded, results: items });
  callback(items);
  return 'ok';
}
