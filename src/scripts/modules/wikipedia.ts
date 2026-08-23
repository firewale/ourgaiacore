import type { Bounds } from './coordinate.js';

const apiUrl = '/api/wikipedia';

// A category id, e.g. 'museum' or a user-added category's slug. Open-ended
// (not a closed union) because the valid set now lives in the `categories`
// table and is user-extensible at runtime — see modules/categories.ts.
export type ArticleCategory = string;

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

// Wikipedia's geosearch API rejects bounding boxes wider than ~0.2 degrees per
// side with a "toobig" error, which the server surfaces as a 502. At low zoom
// levels the padded viewport easily exceeds that, so clamp to a box of this
// size centered on the viewport before it's ever sent. Kept a bit under the
// server's own 0.2 cap since roundBounds() rounds each edge separately and can
// widen the span by up to 0.01 (0.005 per side).
const MAX_BBOX_SPAN = 0.18;

function clampSpan(b: Bounds): Bounds {
  const latCenter = (b.north + b.south) / 2;
  const lngCenter = (b.east + b.west) / 2;
  const halfLat = Math.min(b.north - b.south, MAX_BBOX_SPAN) / 2;
  const halfLng = Math.min(b.east - b.west, MAX_BBOX_SPAN) / 2;
  return {
    north: latCenter + halfLat,
    south: latCenter - halfLat,
    east: lngCenter + halfLng,
    west: lngCenter - halfLng,
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

// Persists a manual category override for a single article. Callers are
// expected to update their own in-memory article object's `category` on
// success — this module doesn't rewrite `cache` entries itself, since the
// cached WikiArticle objects are shared by reference with every caller.
export async function setArticleCategory(pageId: number, category: ArticleCategory): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/${pageId}/category`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    });
    if (!res.ok) console.error('Failed to save category override:', res.status);
    return res.ok;
  } catch (err) {
    console.error('Category override request failed:', err);
    return false;
  }
}

export type WikiDataStatus = 'ok' | 'rate-limited' | 'error';

// The server streams results as newline-delimited JSON chunks (one
// Record<number, WikiArticle> per line) as each batch of articles resolves,
// rather than making the caller wait for a full viewport (up to 500 articles)
// to finish — that can take a minute or more for a city with a cold cache.
// `callback` is invoked once per chunk with the accumulated results so far
// (isFinal false), then once more after the stream ends (isFinal true) so the
// caller knows it's safe to do final reconciliation (e.g. removing markers
// for articles that turned out not to be in the result set).
async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: Record<number, WikiArticle>) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const consumeLine = (line: string): void => {
    const trimmed = line.trim();
    if (trimmed) onChunk(JSON.parse(trimmed) as Record<number, WikiArticle>);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      consumeLine(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
    }
    if (done) break;
  }
  consumeLine(buffer);
}

export async function getWikipediaData(
  bounds: Bounds,
  callback: (results: Record<number, WikiArticle>, isFinal: boolean) => void
): Promise<WikiDataStatus> {
  const cached = cache.find((entry) => contains(entry.bounds, bounds));
  if (cached) {
    callback(cached.results, true);
    return 'ok';
  }

  const rounded = roundBounds(clampSpan(padBounds(bounds)));
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
  if (!apiRes.body) { console.error('Wikipedia API response has no body'); return 'error'; }

  // A fresh shallow copy is handed to the callback each time (rather than the
  // same mutable object) so a caller inspecting an earlier call's results later
  // isn't surprised to find it mutated by a subsequent chunk.
  const accumulated: Record<number, WikiArticle> = {};
  try {
    await readNdjson(apiRes.body, (chunk) => {
      Object.assign(accumulated, chunk);
      callback({ ...accumulated }, false);
    });
  } catch (err) {
    console.error('Wikipedia API parse error:', err);
    return 'error';
  }

  cache.push({ bounds: rounded, results: accumulated });
  callback({ ...accumulated }, true);
  return 'ok';
}
