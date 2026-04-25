import { Router } from 'express';
import { getRedisClient, isRedisReady } from '../lib/redisClient.js';

export const wikipediaRouter = Router();

const GEO_TTL = 24 * 60 * 60;       // 24 hours
const EXTRACT_TTL = 7 * 24 * 60 * 60; // 7 days
const ARTICLE_BATCH_SIZE = 20;       // Wikipedia TextExtracts API limit for exintro extracts per request

const WIKI_GEO_URL = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*';
// No clshow filter — keyword classifier ignores maintenance categories naturally
const WIKI_ARTICLE_URL =
  'https://en.wikipedia.org/w/api.php?format=json&action=query' +
  '&prop=extracts|categories&exintro=1&clshow=!hidden&cllimit=500&origin=*';

export type ArticleCategory =
  | 'museum' | 'worship' | 'park' | 'historic'
  | 'education' | 'transport' | 'city' | 'demolished' | 'shopping' | 'ghost-town' | 'waterway' | 'neighborhood' | 'plane-crash' | 'hospital' | 'landform' | 'urban-legend' | 'food-and-drink' | 'art' | 'natural-disaster' | 'sport' | 'infrastructure' | 'event' | 'industry' | 'community' | 'maritime' | 'tech' | 'performing-arts' | 'trail' | 'recording-studio' | 'entertainment' | 'default';

interface GeoSearchItem { title: string; lat: number; lon: number; pageid: number; }
interface WikiArticle { title: string; lat: number; long: number; pageId: number; extract?: string; category: ArticleCategory; }

const CATEGORY_RULES: Array<{ keywords: string[]; type: ArticleCategory }> = [
  { keywords: ['museum', 'gallery', 'galleries'], type: 'museum' },
  { keywords: ['church', 'cathedral', 'chapel', 'mosque', 'synagogue', 'temple', 'monastery', 'abbey', 'gurdwara', 'religious buildings and structures'], type: 'worship' },
  { keywords: ['park', 'garden', 'nature reserve', 'wildlife', 'forest'], type: 'park' },
  { keywords: ['listed building', 'heritage', 'historic', 'castle', 'palace', 'fort', 'ruins', 'archaeological', 'houses in'], type: 'historic' },
  { keywords: ['university', 'college', 'school', 'academy', 'library'], type: 'education' },
  { keywords: ['station', 'airport', 'railway', 'bridge', 'canal', 'port', 'harbour'], type: 'transport' },
  { keywords: ['cities in', 'census-designated places in', 'incorporated cities and towns', 'unincorporated communities in', 'counties in'], type: 'city' },
  { keywords: ['demolished'], type: 'demolished' },
  { keywords: ['shopping mall', 'shopping center', 'shopping district'], type: 'shopping' },
  { keywords: ['ghost town', 'former settlement'], type: 'ghost-town' },
  { keywords: ['neighborhoods in', 'districts of'], type: 'neighborhood' },
  { keywords: ['aviation accidents', 'airliner accidents'], type: 'plane-crash' },
  { keywords: ['hospitals in', 'hospital buildings'], type: 'hospital' },
  { keywords: ['rivers of', 'creeks of', 'streams of', 'tributaries of', 'bodies of water', 'aquifers in', 'lakes in', 'reservoirs in', 'bays of', 'islands of'], type: 'waterway' },
  { keywords: ['canyons and gorges', 'valleys of', 'landforms of', 'hills of', 'mountains of', 'mountain ranges of'], type: 'landform' },
  { keywords: ['urban legend', 'folklore', 'ghosts', 'cryptid'], type: 'urban-legend' },
  { keywords: ['food and drink', 'chocolate companies', 'cuisine of', 'breweries', 'wineries', 'restaurants', 'distilleries'], type: 'food-and-drink' },
  { keywords: ['sculpture', 'public art', 'murals', 'street art', 'art installations'], type: 'art' },
  { keywords: ['natural disasters', 'earthquakes in', 'floods in', 'wildfires in', 'tornadoes in', 'hurricanes in'], type: 'natural-disaster' },
  { keywords: ['golf clubs and courses', 'sports venues', 'stadiums in', 'arenas in', 'racetracks in', 'swimming venues', 'athletic', 'athletic conference', 'sports league'], type: 'sport' },
  { keywords: ['air traffic control', 'power stations in', 'power plants in', 'sewage', 'water treatment', 'telecommunications', 'radio stations in', 'television stations in', 'pipelines', 'substations', 'area codes in'], type: 'infrastructure' },
  { keywords: ['festivals in', 'recurring events', 'annual events', 'fairs in', 'parades in'], type: 'event' },
  { keywords: ['assembly plants', 'manufacturing', 'factories', 'industrial buildings', 'mills in', 'refineries', 'canneries', 'foundries'], type: 'industry' },
  { keywords: ['non-profit organizations', 'charities', 'community organizations', 'historical societies', 'volunteer', 'advocacy'], type: 'community' },
  { keywords: ['shipwrecks', 'ships built in', 'naval vessels', 'maritime incidents', 'submarines of', 'destroyers', 'battleships', 'cruisers'], type: 'maritime' },
  { keywords: ['video game companies', 'software companies', 'technology companies', 'semiconductor', 'biotechnology companies', 'computer science', 'internet companies', 'artificial intelligence', 'integrated development environments', 'cloud computing'], type: 'tech' },
  { keywords: ['music venues', 'theatres in', 'theaters in', 'concert halls', 'opera houses', 'performing arts', 'amphitheaters in'], type: 'performing-arts' },
  { keywords: ['trails in', 'hiking trails', 'rail trails', 'walking trails'], type: 'trail' },
  { keywords: ['recording studios', 'record labels', 'music recording'], type: 'recording-studio' },
  { keywords: ['casinos in', 'entertainment venues', 'amusement parks', 'nightclubs'], type: 'entertainment' },
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
  { keywords: ['church', 'cathedral', 'chapel', 'mosque', 'synagogue', 'temple', 'monastery', 'abbey', 'gurdwara', 'cemetery'], type: 'worship' },
  { keywords: ['park', 'garden', 'shoreline', 'nature reserve', 'wildlife', 'forest', 'open space', 'recreation area'], type: 'park' },
  { keywords: ['mansion', 'city hall', 'hall of justice', 'historic', 'castle', 'palace', 'fort', 'ruins', 'rancho', 'house'], type: 'historic' },
  { keywords: ['university', 'college', 'high school', 'school', 'academy', 'library'], type: 'education' },
  { keywords: ['hospital', 'medical center'], type: 'hospital' },
  { keywords: ['station', 'airport', 'railway', 'bridge', 'canal', 'port', 'harbour'], type: 'transport' },
  { keywords: ['creek', 'river', 'stream', 'lake', 'reservoir', 'slough', 'bay', 'estuary', 'island'], type: 'waterway' },
  { keywords: ['stadium', 'speedway', 'golf course', 'country club', 'arena'], type: 'sport' },
  { keywords: ['theater', 'theatre', 'amphitheater', 'amphitheatre', 'music hall', 'concert hall', 'opera house'], type: 'performing-arts' },
  { keywords: ['trail', 'trailhead'], type: 'trail' },
  { keywords: ['recording studio', 'record label'], type: 'recording-studio' },
  { keywords: ['casino', 'nightclub'], type: 'entertainment' },
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
