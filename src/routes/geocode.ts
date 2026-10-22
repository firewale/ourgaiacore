import { Router } from 'express';
import { getRedisClient, isRedisReady } from '../lib/redisClient.js';
import { throttledFetch } from '../lib/nominatimThrottle.js';
import {
  NEGATIVE_TTL,
  NOMINATIM_URL,
  NOMINATIM_USER_AGENT,
  POSITIVE_TTL,
  searchPlaces,
  type GeocodePlace,
} from '../lib/geocode.js';

export const geocodeRouter = Router();

geocodeRouter.get('/search', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  if (!q) {
    res.status(400).json({ error: 'q query param is required' });
    return;
  }

  const result = await searchPlaces(q);
  if (result.status === 'rate-limited') { res.status(429).end(); return; }
  if (result.status === 'error') {
    if (result.message) res.status(502).json({ error: result.message });
    else res.status(502).end();
    return;
  }
  res.json({ results: result.results });
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
