import { Router } from 'express';
import { getRedisClient, isRedisReady } from '../lib/redisClient.js';

export const wikipediaRouter = Router();

const GEO_TTL = 24 * 60 * 60;       // 24 hours
const EXTRACT_TTL = 7 * 24 * 60 * 60; // 7 days

const WIKI_GEO_URL = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*';
const WIKI_EXTRACT_URL = 'https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&origin=*';

interface GeoSearchItem { title: string; lat: number; lon: number; pageid: number; }
interface WikiArticle { title: string; lat: number; long: number; pageId: number; extract?: string; }

wikipediaRouter.get('/', async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: 'lat and lng query params are required and must be numbers' });
    return;
  }

  const geoCacheKey = `wiki:geo:${lat.toFixed(2)}:${lng.toFixed(2)}`;

  // Layer 1: Redis geo cache
  if (isRedisReady()) {
    try {
      const cached = await getRedisClient().get(geoCacheKey);
      if (cached) {
        console.log(`[wiki] geo cache hit for ${geoCacheKey}`);
        res.json(JSON.parse(cached));
        return;
      }
      console.log(`[wiki] geo cache miss for ${geoCacheKey}`);
    } catch {
      // Redis error — fall through to Wikipedia
    }
  }

  // Layer 2: Wikipedia geosearch
  const geoParams = new URLSearchParams({
    list: 'geosearch',
    gscoord: `${lat}|${lng}`,
    gsradius: '10000',
    gslimit: '100',
  });

  let geoRes: Response;
  try {
    geoRes = await fetch(`${WIKI_GEO_URL}&${geoParams}`);
  } catch {
    res.status(502).json({ error: 'Wikipedia geosearch request failed' });
    return;
  }

  if (geoRes.status === 429) { res.status(429).end(); return; }
  if (!geoRes.ok) { res.status(502).end(); return; }

  const geoData = await geoRes.json() as {
    error?: { info: string };
    query: { geosearch: GeoSearchItem[] };
  };

  if (geoData.error) { res.status(502).json({ error: geoData.error.info }); return; }

  const items: Record<number, WikiArticle> = {};
  for (const item of geoData.query.geosearch) {
    items[item.pageid] = { title: item.title, lat: item.lat, long: item.lon, pageId: item.pageid };
  }

  // Layer 3: per-article extract cache, then Wikipedia for misses
  const newExtracts = new Map<number, string>();

  await Promise.all(Object.values(items).map(async (article) => {
    const extractKey = `wiki:extract:${article.pageId}`;

    if (isRedisReady()) {
      try {
        const cached = await getRedisClient().get(extractKey);
        if (cached !== null) {
          console.log(`[wiki] extract cache hit for pageId ${article.pageId}`);
          article.extract = cached;
          return;
        }
        console.log(`[wiki] extract cache miss for pageId ${article.pageId}`);
      } catch {
        // Fall through to Wikipedia
      }
    }

    const params = new URLSearchParams({ pageids: String(article.pageId) });
    try {
      const extractRes = await fetch(`${WIKI_EXTRACT_URL}&${params}`);
      if (!extractRes.ok) return;
      const data = await extractRes.json() as {
        query?: { pages?: Record<string, { extract?: string }> };
      };
      const extract = data?.query?.pages?.[String(article.pageId)]?.extract;
      if (extract !== undefined) {
        article.extract = extract;
        newExtracts.set(article.pageId, extract);
      }
    } catch {
      // Extract failure is non-fatal
    }
  }));

  // Fire-and-forget Redis writes
  if (isRedisReady()) {
    const redis = getRedisClient();
    redis.setex(geoCacheKey, GEO_TTL, JSON.stringify(items)).catch(() => {});
    for (const [pageId, extract] of newExtracts) {
      redis.setex(`wiki:extract:${pageId}`, EXTRACT_TTL, extract).catch(() => {});
    }
  }

  res.json(items);
});
