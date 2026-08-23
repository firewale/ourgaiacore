import { Router } from 'express';
import { getRedisClient, isRedisReady } from '../lib/redisClient.js';
import { getCategoryRules, getTitleRules } from '../lib/categoryRules.js';
import { getCategoryOverrides, setCategoryOverride } from '../lib/articleCategoryOverrides.js';
import { isValidCategoryId } from '../lib/categories.js';
import type { ArticleCategory } from '../lib/articleCategory.js';

export type { ArticleCategory } from '../lib/articleCategory.js';

export const wikipediaRouter = Router();

const GEO_TTL = 24 * 60 * 60;       // 24 hours
const EXTRACT_TTL = 7 * 24 * 60 * 60; // 7 days
const ARTICLE_BATCH_SIZE = 20;       // Wikipedia TextExtracts API limit for exintro extracts per request
const BATCH_CONCURRENCY = 5;         // firing all batches at once (e.g. 25 for a full 500-result viewport)
                                      // trips Wikipedia's anonymous rate limit — most come back 429
const MAX_FETCH_RETRIES = 3;

const WIKI_GEO_URL = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*';
// No clshow filter — keyword classifier ignores maintenance categories naturally
const WIKI_ARTICLE_URL =
  'https://en.wikipedia.org/w/api.php?format=json&action=query' +
  '&prop=extracts|categories&exintro=1&clshow=!hidden&cllimit=500&origin=*';

interface GeoSearchItem { title: string; lat: number; lon: number; pageid: number; }
interface WikiArticle { title: string; lat: number; long: number; pageId: number; extract?: string; category: ArticleCategory; }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries on 429, honoring Wikipedia's `retry-after` header (typically 1s) —
// bounded concurrency alone doesn't fully eliminate 429s under bursty load.
async function fetchWithRetry(url: string, maxRetries = MAX_FETCH_RETRIES): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.status !== 429 || attempt >= maxRetries) return res;
    const retryAfterSec = Number(res.headers.get('retry-after'));
    await sleep((Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec : 1) * 1000);
  }
}

// Runs `fn` over `items` with at most `limit` calls in flight at once —
// unbounded Promise.all across dozens of batches is what triggers Wikipedia's
// rate limiting in the first place.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function toDict(articles: WikiArticle[]): Record<number, WikiArticle> {
  return Object.fromEntries(articles.map(a => [a.pageId, a]));
}

// Manual per-article overrides always win over the keyword classifier —
// applied at every point articles are written to the response, so an edit
// takes effect immediately regardless of which cache layer served the data.
function applyOverrides(record: Record<number, WikiArticle>, overrides: Map<number, ArticleCategory>): void {
  for (const [pageId, category] of overrides) {
    if (record[pageId]) record[pageId].category = category;
  }
}

function firstParagraph(html: string): string {
  for (const match of html.matchAll(/<p[^>]*>[\s\S]*?<\/p>/gi)) {
    const inner = match[0].replace(/<[^>]+>/g, '').trim();
    if (inner) return match[0];
  }
  return html;
}

function classifyCategories(rawCategories: string[]): ArticleCategory {
  const lower = rawCategories.map(c => c.toLowerCase());
  for (const rule of getCategoryRules()) {
    if (lower.some(cat => cat.includes(rule.keyword))) return rule.category;
  }
  return 'default';
}

function classifyByTitle(title: string): ArticleCategory {
  const lower = title.toLowerCase();
  for (const rule of getTitleRules()) {
    if (lower.includes(rule.keyword)) return rule.category;
  }
  return 'default';
}

// Wikipedia's own geosearch API rejects gsbbox requests wider than ~0.2 degrees
// per side with a "toobig" error (which we'd otherwise forward as a 502), so this
// cap must not exceed that. This endpoint is also publicly reachable directly,
// not just via the client's own clamping logic, so it needs to hold on its own.
const MAX_BBOX_DEGREES = 0.2;

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

  // Response body is newline-delimited JSON (one Record<number, WikiArticle>
  // chunk per line) so the client can plot markers as they resolve instead of
  // waiting for a full viewport (up to 500 articles / 25 batches) to finish —
  // that could take a minute-plus for a city with a cold cache. Error paths
  // below run before any bytes are written, so they can still safely respond
  // with a plain JSON body instead; Express lets the Content-Type be
  // overwritten as long as nothing has been flushed yet.
  res.setHeader('Content-Type', 'application/x-ndjson');
  const writeChunk = (data: Record<number, WikiArticle>): void => {
    if (Object.keys(data).length > 0) res.write(JSON.stringify(data) + '\n');
  };

  // Layer 1: Redis geo cache
  if (isRedisReady()) {
    try {
      const cached = await getRedisClient().get(geoCacheKey);
      if (cached) {
        console.log(`[wiki] geo cache hit for ${geoCacheKey}`);
        const data = JSON.parse(cached) as Record<number, WikiArticle>;
        const cachedOverrides = await getCategoryOverrides(Object.keys(data).map(Number));
        applyOverrides(data, cachedOverrides);
        writeChunk(data);
        res.end();
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

  const overrides = await getCategoryOverrides(Object.keys(items).map(Number));

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

  // Stream already-resolved (cache-hit) articles immediately — no need to make
  // the user wait for the live batch fetches below just to see these.
  const uncachedIds = new Set(uncachedArticles.map(a => a.pageId));
  const preResolved = toDict(Object.values(items).filter(a => !uncachedIds.has(a.pageId)));
  applyOverrides(preResolved, overrides);
  writeChunk(preResolved);

  // Batch-fetch uncached articles from Wikipedia (max 20 pageids per request).
  // Batches are independent requests, so run them with bounded concurrency
  // rather than fully sequentially — with a full viewport (up to 500 geosearch
  // results / 25 batches), sequential fetching was adding several seconds of
  // latency. Firing them all at once via Promise.all was tried, but Wikipedia's
  // anonymous rate limit rejects most of a 25-wide burst with 429s.
  const batches: WikiArticle[][] = [];
  for (let i = 0; i < uncachedArticles.length; i += ARTICLE_BATCH_SIZE) {
    batches.push(uncachedArticles.slice(i, i + ARTICLE_BATCH_SIZE));
  }

  const batchResults = await mapWithConcurrency(batches, BATCH_CONCURRENCY, async (batch) => {
    const pageids = batch.map(a => a.pageId).join('|');
    try {
      const articleRes = await fetchWithRetry(`${WIKI_ARTICLE_URL}&pageids=${pageids}`);
      if (!articleRes.ok) {
        console.error(`[wiki] Batch fetch failed for pageids [${pageids}]: HTTP ${articleRes.status}`);
        const fallback = toDict(batch); // still plot these pins now, with the default (or overridden) category
        applyOverrides(fallback, overrides);
        writeChunk(fallback);
        return false;
      }
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
      const resolved = toDict(batch);
      applyOverrides(resolved, overrides);
      writeChunk(resolved);
      return true;
    } catch (err) {
      console.error('[wiki] Batch fetch error:', err);
      const fallback = toDict(batch);
      applyOverrides(fallback, overrides);
      writeChunk(fallback);
      return false;
    }
  });

  const allBatchesSucceeded = batchResults.every(Boolean);

  // Only write geo cache when article data is complete — skip if any batch failed
  // (prevents caching incomplete data that would suppress extracts on future requests)
  const geoCacheReady = uncachedArticles.length === 0 || allBatchesSucceeded;
  if (isRedisReady()) {
    const redis = getRedisClient();
    if (geoCacheReady) redis.setex(geoCacheKey, GEO_TTL, JSON.stringify(items)).catch(() => {});
    for (const [pageId, data] of newArticleData) {
      redis.setex(`wiki:extract:${pageId}`, EXTRACT_TTL, JSON.stringify(data)).catch(() => {});
    }
  }

  res.end();
});

// Lets the client set a manual category override for a single article
// (e.g. from the marker popup), overriding whatever the keyword classifier
// would otherwise produce. Persisted in Postgres — see articleCategoryOverrides.ts
// for how it's applied on subsequent GET /api/wikipedia responses.
wikipediaRouter.patch('/:pageId/category', async (req, res) => {
  const pageId = parseInt(req.params.pageId, 10);
  if (isNaN(pageId)) {
    res.status(400).json({ error: 'pageId must be a number' });
    return;
  }

  const category = (req.body as { category?: unknown } | undefined)?.category;
  if (typeof category !== 'string' || !isValidCategoryId(category)) {
    res.status(400).json({ error: 'category must be a valid category id — see GET /api/categories' });
    return;
  }

  try {
    await setCategoryOverride(pageId, category as ArticleCategory);
    res.status(204).end();
  } catch (err) {
    console.error('[wiki] Failed to save category override:', err);
    res.status(503).json({ error: 'Could not save category override — database unavailable' });
  }
});
