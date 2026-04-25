import { Router } from 'express';
import { getRedisClient, isRedisReady } from '../lib/redisClient.js';

export const wikipediaRouter = Router();

const GEO_TTL = 24 * 60 * 60;       // 24 hours
const EXTRACT_TTL = 7 * 24 * 60 * 60; // 7 days
const ARTICLE_BATCH_SIZE = 50;       // Wikipedia API limit for pageids per request

const WIKI_GEO_URL = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*';
// No clshow filter — keyword classifier ignores maintenance categories naturally
const WIKI_ARTICLE_URL =
  'https://en.wikipedia.org/w/api.php?format=json&action=query' +
  '&prop=extracts|categories&exintro=1&clshow=!hidden&cllimit=20&origin=*';

export type ArticleCategory =
  | 'museum' | 'church' | 'park' | 'historic'
  | 'education' | 'transport' | 'default';

interface GeoSearchItem { title: string; lat: number; lon: number; pageid: number; }
interface WikiArticle { title: string; lat: number; long: number; pageId: number; extract?: string; category: ArticleCategory; }

const CATEGORY_RULES: Array<{ keywords: string[]; type: ArticleCategory }> = [
  { keywords: ['museum', 'gallery', 'galleries'], type: 'museum' },
  { keywords: ['church', 'cathedral', 'chapel', 'mosque', 'synagogue', 'temple', 'monastery', 'abbey'], type: 'church' },
  { keywords: ['park', 'garden', 'nature reserve', 'wildlife', 'forest'], type: 'park' },
  { keywords: ['listed building', 'heritage', 'historic', 'castle', 'palace', 'fort', 'ruins', 'archaeological'], type: 'historic' },
  { keywords: ['university', 'college', 'school', 'academy', 'library'], type: 'education' },
  { keywords: ['station', 'airport', 'railway', 'bridge', 'canal', 'port', 'harbour'], type: 'transport' },
];

function classifyCategories(rawCategories: string[]): ArticleCategory {
  const lower = rawCategories.map(c => c.toLowerCase());
  for (const rule of CATEGORY_RULES) {
    if (lower.some(cat => rule.keywords.some(kw => cat.includes(kw)))) return rule.type;
  }
  return 'default';
}

const TITLE_RULES: Array<{ keywords: string[]; type: ArticleCategory }> = [
  { keywords: ['museum', 'gallery'], type: 'museum' },
  { keywords: ['church', 'cathedral', 'chapel', 'mosque', 'synagogue', 'temple', 'monastery', 'abbey', 'cemetery'], type: 'church' },
  { keywords: ['park', 'garden', 'shoreline', 'nature reserve', 'wildlife', 'forest', 'open space', 'recreation area'], type: 'park' },
  { keywords: ['mansion', 'city hall', 'hall of justice', 'historic', 'castle', 'palace', 'fort', 'ruins', 'rancho'], type: 'historic' },
  { keywords: ['university', 'college', 'high school', 'school', 'academy', 'library'], type: 'education' },
  { keywords: ['station', 'airport', 'railway', 'bridge', 'canal', 'port', 'harbour'], type: 'transport' },
];

function classifyByTitle(title: string): ArticleCategory {
  const lower = title.toLowerCase();
  for (const rule of TITLE_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) return rule.type;
  }
  return 'default';
}

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

  let geoData: { error?: { info: string }; query?: { geosearch: GeoSearchItem[] } };
  try {
    geoData = await geoRes.json();
  } catch {
    res.status(502).json({ error: 'Wikipedia geosearch returned unexpected response' });
    return;
  }

  if (geoData.error) { res.status(502).json({ error: geoData.error.info }); return; }
  if (!geoData.query?.geosearch) { res.status(502).json({ error: 'Wikipedia geosearch missing results' }); return; }

  const items: Record<number, WikiArticle> = {};
  for (const item of geoData.query.geosearch) {
    items[item.pageid] = { title: item.title, lat: item.lat, long: item.lon, pageId: item.pageid, category: 'default' };
  }

  // Layer 3: check Redis per-article cache, collect misses for batch Wikipedia fetch
  const newArticleData = new Map<number, { extract: string; category: ArticleCategory }>();
  const uncachedArticles: WikiArticle[] = [];

  try {
    await Promise.all(Object.values(items).map(async (article) => {
      const extractKey = `wiki:extract:${article.pageId}`;

      if (isRedisReady()) {
        try {
          const cached = await getRedisClient().get(extractKey);
          if (cached !== null) {
            try {
              const parsed = JSON.parse(cached) as { extract?: string; category?: ArticleCategory };
              if (parsed.extract !== undefined) article.extract = parsed.extract;
              const cachedCat = parsed.category ?? 'default';
              article.category = cachedCat !== 'default' ? cachedCat : classifyByTitle(article.title);
              console.log(`[wiki] extract cache hit for pageId ${article.pageId}`);
            } catch {
              // Legacy plain-string value — treat as extract only
              article.extract = cached;
              article.category = 'default';
              console.log(`[wiki] extract cache hit (legacy) for pageId ${article.pageId}`);
            }
            return;
          }
          console.log(`[wiki] extract cache miss for pageId ${article.pageId}`);
        } catch {
          // Fall through to Wikipedia
        }
      }

      uncachedArticles.push(article);
    }));
  } catch (err) {
    console.error('[wiki] Redis cache phase error:', err);
    // Continue — uncachedArticles may be partial but we can still fetch from Wikipedia
  }

  // Batch-fetch uncached articles from Wikipedia (max 50 pageids per request)
  let allBatchesSucceeded = true;
  for (let i = 0; i < uncachedArticles.length; i += ARTICLE_BATCH_SIZE) {
    const batch = uncachedArticles.slice(i, i + ARTICLE_BATCH_SIZE);
    const pageids = batch.map(a => a.pageId).join('|');
    try {
      const articleRes = await fetch(`${WIKI_ARTICLE_URL}&pageids=${pageids}`);
      if (!articleRes.ok) { allBatchesSucceeded = false; continue; }
      const data = await articleRes.json() as {
        query?: {
          pages?: Record<string, {
            extract?: string;
            categories?: Array<{ title: string }>;
          }>;
        };
      };
      const pages = data?.query?.pages ?? {};
      for (const article of batch) {
        const page = pages[String(article.pageId)];
        if (!page) continue;
        const rawCats = (page.categories ?? []).map(c => c.title.replace(/^Category:/i, ''));
        const catCategory = classifyCategories(rawCats);
        article.category = catCategory !== 'default' ? catCategory : classifyByTitle(article.title);
        if (page.extract !== undefined) {
          article.extract = page.extract;
          newArticleData.set(article.pageId, { extract: page.extract, category: article.category });
        }
      }
    } catch (err) {
      console.error('[wiki] Batch fetch error:', err);
      allBatchesSucceeded = false;
    }
  }

  // Only write geo cache when article data is complete — skip if any batch failed
  // (prevents caching incomplete data that would suppress extracts on future requests)
  const geoCacheReady = uncachedArticles.length === 0 || allBatchesSucceeded;
  if (isRedisReady()) {
    const redis = getRedisClient();
    if (geoCacheReady) redis.setex(geoCacheKey, GEO_TTL, JSON.stringify(items)).catch(() => {});
    for (const [pageId, data] of newArticleData) {
      redis.setex(`wiki:article:${pageId}`, EXTRACT_TTL, JSON.stringify(data)).catch(() => {});
    }
  }

  res.json(items);
});
