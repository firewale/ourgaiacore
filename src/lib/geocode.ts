import { getRedisClient, isRedisReady } from './redisClient.js';
import { throttledFetch } from './nominatimThrottle.js';

export const NOMINATIM_URL = process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';
export const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT ?? 'OurGaiaCore/1.0 (contact: your-email@example.com)';

export const POSITIVE_TTL = 30 * 24 * 60 * 60; // 30 days — place names/addresses rarely move
export const NEGATIVE_TTL = 60 * 60; // 1 hour — don't permanently cache "not found" in case of a fixable typo

export interface GeocodePlace {
  lat: number;
  lon: number;
  displayName: string;
}

// 'rate-limited' and 'error' mirror the 429 / 502 the geocode route returns;
// 'ok' may still carry an empty results list (a genuine "not found").
export type GeocodeSearchResult =
  | { status: 'ok'; results: GeocodePlace[] }
  | { status: 'rate-limited' }
  | { status: 'error'; message?: string };

// Shared by GET /api/geocode/search and the MCP navigation tool, so both go
// through the same Redis cache and Nominatim rate limiter.
export async function searchPlaces(query: string): Promise<GeocodeSearchResult> {
  const q = query.trim();
  const cacheKey = `geocode:search:${q.toLowerCase()}`;
  if (isRedisReady()) {
    try {
      const cached = await getRedisClient().get(cacheKey);
      if (cached) return { status: 'ok', results: JSON.parse(cached).results };
    } catch {
      // Redis error — fall through to Nominatim
    }
  }

  const params = new URLSearchParams({ q, format: 'jsonv2', limit: '5' });

  let apiRes: Response;
  try {
    apiRes = await throttledFetch(`${NOMINATIM_URL}/search?${params}`, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
    });
  } catch {
    return { status: 'error', message: 'Nominatim request failed' };
  }

  if (apiRes.status === 429) return { status: 'rate-limited' };
  if (!apiRes.ok) return { status: 'error' };

  let raw: Array<{ lat: string; lon: string; display_name: string }>;
  try {
    raw = await apiRes.json();
  } catch {
    return { status: 'error', message: 'Nominatim returned unexpected response' };
  }

  const results: GeocodePlace[] = raw.map((r) => ({
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    displayName: r.display_name,
  }));

  if (isRedisReady()) {
    const ttl = results.length > 0 ? POSITIVE_TTL : NEGATIVE_TTL;
    getRedisClient().setex(cacheKey, ttl, JSON.stringify({ results })).catch(() => {});
  }
  return { status: 'ok', results };
}
