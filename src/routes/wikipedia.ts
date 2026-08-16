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
  { keywords: ['church', 'cathedral', 'chapel', 'mosque', 'synagogue', 'temple', 'monastery', 'abbey', 'gurdwara', 'religious buildings and structures', 'roman catholic', 'dioceses', 'archdiocese', 'parishes'], type: 'worship' },
  { keywords: ['park', 'garden', 'nature reserve', 'wildlife', 'forest'], type: 'park' },
  { keywords: ['listed building', 'heritage', 'historic', 'castle', 'palace', 'fort', 'ruins', 'archaeological', 'houses in', 'skyscraper', 'office buildings', 'mixed-use developments', 'residential buildings', 'high-rise buildings', 'buildings and structures in', 'battles of', 'battles involving'], type: 'historic' },
  { keywords: ['university', 'college', 'school', 'academy', 'library'], type: 'education' },
  { keywords: ['station', 'airport', 'railway', 'bridge', 'canal', 'harbor', 'harbour', 'ports of', 'ports in', 'port of'], type: 'transport' },
  { keywords: ['cities in', 'census-designated places in', 'incorporated cities and towns', 'unincorporated communities in', 'counties in', 'metropolitan areas', 'metropolitan statistical areas'], type: 'city' },
  { keywords: ['demolished'], type: 'demolished' },
  { keywords: ['shopping mall', 'shopping center', 'shopping district'], type: 'shopping' },
  { keywords: ['ghost town', 'former settlement'], type: 'ghost-town' },
  { keywords: ['neighborhoods in', 'districts of', 'sectors of', 'populated places in', 'suburbs of', 'streets in'], type: 'neighborhood' },
  { keywords: ['aviation accidents', 'airliner accidents'], type: 'plane-crash' },
  { keywords: ['hospitals in', 'hospital buildings'], type: 'hospital' },
  { keywords: ['rivers of', 'creeks of', 'streams of', 'tributaries of', 'bodies of water', 'aquifers in', 'lakes in', 'reservoirs in', 'bays of', 'islands of'], type: 'waterway' },
  { keywords: ['canyons and gorges', 'valleys of', 'landforms of', 'hills of', 'mountains of', 'mountain ranges of'], type: 'landform' },
  { keywords: ['urban legend', 'folklore', 'ghosts', 'cryptid'], type: 'urban-legend' },
  { keywords: ['food and drink', 'chocolate companies', 'cuisine of', 'breweries', 'wineries', 'restaurants', 'distilleries'], type: 'food-and-drink' },
  { keywords: ['sculpture', 'public art', 'murals', 'street art', 'art installations'], type: 'art' },
  { keywords: ['natural disasters', 'earthquakes in', 'floods in', 'wildfires in', 'tornadoes in', 'hurricanes in'], type: 'natural-disaster' },
  { keywords: ['golf clubs and courses', 'sports venues', 'stadiums in', 'arenas in', 'racetracks in', 'swimming venues', 'athletic', 'athletic conference', 'sports league', 'football clubs', 'association football', 'rugby clubs', 'cricket clubs', 'basketball teams', 'baseball teams', 'sports clubs', 'league clubs', 'sports teams'], type: 'sport' },
  { keywords: ['air traffic control', 'power stations in', 'power plants in', 'sewage', 'water treatment', 'telecommunications', 'radio stations in', 'television stations in', 'pipelines', 'substations', 'area codes in', 'electric power companies', 'power companies of', 'energy companies', 'government-owned energy'], type: 'infrastructure' },
  { keywords: ['festivals in', 'recurring events', 'annual events', 'fairs in', 'parades in', 'convention centers'], type: 'event' },
  { keywords: ['assembly plants', 'manufacturing', 'factories', 'industrial buildings', 'mills in', 'refineries', 'canneries', 'foundries', 'central banks', 'federal reserve', 'banks of', 'banks established', 'financial services companies', 'agriculture companies', 'investment companies', 'organisations based in', 'economy of'], type: 'industry' },
  { keywords: ['non-profit organizations', 'charities', 'community organizations', 'historical societies', 'volunteer', 'advocacy', 'newspapers published in', 'magazines published in', 'mass media in', 'city council', 'government of', 'city councils', 'ministries of', 'government agencies', 'diplomatic missions', 'national lower houses', 'national upper houses', 'politics of'], type: 'community' },
  { keywords: ['shipwrecks', 'ships built in', 'naval vessels', 'maritime incidents', 'submarines of', 'destroyers', 'battleships', 'cruisers'], type: 'maritime' },
  { keywords: ['video game companies', 'software companies', 'technology companies', 'semiconductor', 'biotechnology companies', 'computer science', 'internet companies', 'artificial intelligence', 'integrated development environments', 'cloud computing'], type: 'tech' },
  { keywords: ['music venues', 'theatres in', 'theaters in', 'concert halls', 'opera houses', 'performing arts', 'amphitheaters in'], type: 'performing-arts' },
  { keywords: ['trails in', 'hiking trails', 'rail trails', 'walking trails'], type: 'trail' },
  { keywords: ['recording studios', 'record labels', 'music recording'], type: 'recording-studio' },
  { keywords: ['casinos in', 'entertainment venues', 'amusement parks', 'nightclubs'], type: 'entertainment' },
];

function firstParagraph(html: string): string {
  for (const match of html.matchAll(/<p[^>]*>[\s\S]*?<\/p>/gi)) {
    const inner = match[0].replace(/<[^>]+>/g, '').trim();
    if (inner) return match[0];
  }
  return html;
}

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
  { keywords: ['mansion', 'city hall', 'hall of justice', 'historic', 'castle', 'palace', 'fort', 'ruins', 'rancho', 'house', 'tower', 'plaza', '(building)'], type: 'historic' },
  { keywords: ['university', 'college', 'high school', 'school', 'academy', 'library', 'institute'], type: 'education' },
  { keywords: ['hospital', 'medical center'], type: 'hospital' },
  { keywords: ['station', 'airport', 'railway', 'bridge', 'canal', 'port', 'harbour'], type: 'transport' },
  { keywords: ['creek', 'river', 'stream', 'lake', 'reservoir', 'slough', 'bay', 'estuary', 'island'], type: 'waterway' },
  { keywords: ['stadium', 'speedway', 'golf course', 'country club', 'arena'], type: 'sport' },
  { keywords: ['theater', 'theatre', 'amphitheater', 'amphitheatre', 'music hall', 'concert hall', 'opera house'], type: 'performing-arts' },
  { keywords: ['trail', 'trailhead'], type: 'trail' },
  { keywords: ['recording studio', 'record label'], type: 'recording-studio' },
  { keywords: ['casino', 'nightclub'], type: 'entertainment' },
  { keywords: ['convention center'], type: 'event' },
  { keywords: ['metropolitan area'], type: 'city' },
  { keywords: ['federal reserve', 'reserve bank'], type: 'industry' },
  { keywords: ['hotel', 'inn'], type: 'food-and-drink' },
  { keywords: ['city council'], type: 'community' },
  { keywords: ['list of ambassadors', 'ministry of', 'department of', 'senate of', 'national assembly', 'city council', 'city county'], type: 'community' },
  { keywords: ['energy group', 'power company', 'energy company', 'power and lighting'], type: 'infrastructure' },
  { keywords: ['bank rwanda', 'bank kenya', 'bank nigeria', 'bank africa'], type: 'industry' },
  { keywords: ['avenue', ' street'], type: 'neighborhood' },
  { keywords: ['highrise', 'high rise', 'housing estate'], type: 'neighborhood' },
];

function classifyByTitle(title: string): ArticleCategory {
  const lower = title.toLowerCase();
  for (const rule of TITLE_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) return rule.type;
  }
  return 'default';
}

const MAX_BBOX_DEGREES = 2; // sanity cap — this endpoint is publicly reachable directly, not just via the client's padding logic

wikipediaRouter.get('/', async (req, res) => {
  const north = parseFloat(req.query.north as string);
  const south = parseFloat(req.query.south as string);
  const east = parseFloat(req.query.east as string);
  const west = parseFloat(req.query.west as string);
  if (isNaN(north) || isNaN(south) || isNaN(east) || isNaN(west)) {
    res.status(400).json({ error: 'north, south, east and west query params are required and must be numbers' });
    return;
  }
  if (north <= south || east <= west) {
    res.status(400).json({ error: 'bounds are invalid: north must be greater than south and east must be greater than west' });
    return;
  }
  if (north - south > MAX_BBOX_DEGREES || east - west > MAX_BBOX_DEGREES) {
    res.status(400).json({ error: `bounding box too large: each side must be at most ${MAX_BBOX_DEGREES} degrees` });
    return;
  }

  const geoCacheKey = `wiki:geo:${north}:${south}:${east}:${west}`;

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
    gsbbox: `${north}|${west}|${south}|${east}`,
    gslimit: '500',
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
              article.category = classifyByTitle(article.title);
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

  // Batch-fetch uncached articles from Wikipedia (max 20 pageids per request).
  // Batches are independent requests, so run them concurrently rather than
  // sequentially — with a full viewport (up to 500 geosearch results / 25
  // batches), sequential fetching was adding several seconds of latency.
  const batches: WikiArticle[][] = [];
  for (let i = 0; i < uncachedArticles.length; i += ARTICLE_BATCH_SIZE) {
    batches.push(uncachedArticles.slice(i, i + ARTICLE_BATCH_SIZE));
  }

  const batchResults = await Promise.all(batches.map(async (batch) => {
    const pageids = batch.map(a => a.pageId).join('|');
    try {
      const articleRes = await fetch(`${WIKI_ARTICLE_URL}&pageids=${pageids}`);
      if (!articleRes.ok) return false;
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
          const extract = firstParagraph(page.extract);
          article.extract = extract;
          newArticleData.set(article.pageId, { extract, category: article.category });
        }
      }
      return true;
    } catch (err) {
      console.error('[wiki] Batch fetch error:', err);
      return false;
    }
  }));

  const allBatchesSucceeded = batchResults.every(Boolean);

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
