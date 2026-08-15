import { Router } from 'express';
import { getRedisClient, isRedisReady } from '../lib/redisClient.js';
import { throttledFetch } from '../lib/nominatimThrottle.js';

export const geocodeRouter = Router();

const NOMINATIM_URL = process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';
const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT ?? 'OurGaiaCore/1.0 (contact: your-email@example.com)';

const POSITIVE_TTL = 30 * 24 * 60 * 60; // 30 days — place names/addresses rarely move
const NEGATIVE_TTL = 60 * 60; // 1 hour — don't permanently cache "not found" in case of a fixable typo

interface GeocodePlace {
  lat: number;
  lon: number;
  displayName: string;
}

geocodeRouter.get('/search', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  if (!q) {
    res.status(400).json({ error: 'q query param is required' });
    return;
  }

  const cacheKey = `geocode:search:${q.toLowerCase()}`;
  if (isRedisReady()) {
    try {
      const cached = await getRedisClient().get(cacheKey);
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }
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
    res.status(502).json({ error: 'Nominatim request failed' });
    return;
  }

  if (apiRes.status === 429) { res.status(429).end(); return; }
  if (!apiRes.ok) { res.status(502).end(); return; }

  let raw: Array<{ lat: string; lon: string; display_name: string }>;
  try {
    raw = await apiRes.json();
  } catch {
    res.status(502).json({ error: 'Nominatim returned unexpected response' });
    return;
  }

  const results: GeocodePlace[] = raw.map((r) => ({
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    displayName: r.display_name,
  }));

  const payload = { results };
  if (isRedisReady()) {
    const ttl = results.length > 0 ? POSITIVE_TTL : NEGATIVE_TTL;
    getRedisClient().setex(cacheKey, ttl, JSON.stringify(payload)).catch(() => {});
  }
  res.json(payload);
});

geocodeRouter.get('/reverse', async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: 'lat and lng query params are required and must be numbers' });
    return;
  }

  const cacheKey = `geocode:reverse:${lat.toFixed(5)}:${lng.toFixed(5)}`;
  if (isRedisReady()) {
    try {
      const cached = await getRedisClient().get(cacheKey);
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }
    } catch {
      // Redis error — fall through to Nominatim
    }
  }

  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2' });

  let apiRes: Response;
  try {
    apiRes = await throttledFetch(`${NOMINATIM_URL}/reverse?${params}`, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
    });
  } catch {
    res.status(502).json({ error: 'Nominatim request failed' });
    return;
  }

  if (apiRes.status === 429) { res.status(429).end(); return; }
  if (!apiRes.ok) { res.status(502).end(); return; }

  let data: { lat?: string; lon?: string; display_name?: string; error?: string };
  try {
    data = await apiRes.json();
  } catch {
    res.status(502).json({ error: 'Nominatim returned unexpected response' });
    return;
  }

  const result: GeocodePlace | null = data.error || !data.display_name
    ? null
    : { lat: parseFloat(data.lat!), lon: parseFloat(data.lon!), displayName: data.display_name };

  const payload = { result };
  if (isRedisReady()) {
    const ttl = result ? POSITIVE_TTL : NEGATIVE_TTL;
    getRedisClient().setex(cacheKey, ttl, JSON.stringify(payload)).catch(() => {});
  }
  res.json(payload);
});
