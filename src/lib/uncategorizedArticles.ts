import { getDbClient } from './dbClient.js';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS uncategorized_articles (
    page_id BIGINT PRIMARY KEY,
    title TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    extract TEXT,
    raw_categories TEXT[],
    first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

// Created once per process; retried on the next call if Postgres wasn't up yet,
// so the queue starts filling as soon as it is.
let tableReady: Promise<void> | undefined;
function ensureTable(): Promise<void> {
  tableReady ??= getDbClient().query(CREATE_TABLE_SQL).then(
    () => undefined,
    (err: unknown) => {
      tableReady = undefined;
      throw err;
    }
  );
  return tableReady;
}

export function _resetUncategorizedArticlesForTests(): void {
  tableReady = undefined;
}

export interface UncategorizedArticle {
  pageId: number;
  title: string;
  lat: number;
  lng: number;
  extract: string | null;
  // null when the article was classified from the Redis cache, which doesn't
  // keep raw Wikipedia categories — filled in the next time it's fetched live.
  rawCategories: string[] | null;
}

// Articles the keyword classifier last resolved to 'default' (the "?" marker),
// recorded as GET /api/wikipedia classifies them so an agent has a durable work
// queue — the classification itself otherwise only lives in expiring Redis
// caches. Rows are removed once a later classification succeeds; articles with
// a manual override are filtered out at read time.
export async function initUncategorizedArticles(): Promise<void> {
  try {
    await ensureTable();
    console.log('[uncategorizedArticles] table ready');
  } catch (err) {
    console.warn('[uncategorizedArticles] Postgres unavailable at startup:', (err as Error).message);
  }
}

// Best-effort bookkeeping off the request path — failures are logged, never thrown.
export async function recordClassifications(
  uncategorized: UncategorizedArticle[],
  categorizedPageIds: number[]
): Promise<void> {
  const db = getDbClient();
  try {
    await ensureTable();
    if (uncategorized.length > 0) {
      const rows = uncategorized.map((a) => ({
        page_id: a.pageId,
        title: a.title,
        lat: a.lat,
        lng: a.lng,
        extract: a.extract,
        raw_categories: a.rawCategories,
      }));
      await db.query(
        `INSERT INTO uncategorized_articles (page_id, title, lat, lng, extract, raw_categories)
         SELECT page_id, title, lat, lng, extract, raw_categories
         FROM jsonb_to_recordset($1::jsonb)
           AS x(page_id BIGINT, title TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION, extract TEXT, raw_categories TEXT[])
         ON CONFLICT (page_id) DO UPDATE SET
           title = EXCLUDED.title,
           lat = EXCLUDED.lat,
           lng = EXCLUDED.lng,
           extract = COALESCE(EXCLUDED.extract, uncategorized_articles.extract),
           raw_categories = COALESCE(EXCLUDED.raw_categories, uncategorized_articles.raw_categories),
           last_seen = now()`,
        [JSON.stringify(rows)]
      );
    }
    if (categorizedPageIds.length > 0) {
      await removeUncategorized(categorizedPageIds);
    }
  } catch (err) {
    console.warn('[uncategorizedArticles] failed to record classifications:', (err as Error).message);
  }
}

export async function removeUncategorized(pageIds: number[]): Promise<void> {
  await ensureTable();
  await getDbClient().query('DELETE FROM uncategorized_articles WHERE page_id = ANY($1)', [pageIds]);
}

// Most recently seen first. Throws if Postgres is unreachable so callers (the
// MCP tool) can report it rather than claim there's nothing to do.
export async function listUncategorized(limit: number): Promise<UncategorizedArticle[]> {
  await ensureTable();
  const { rows } = await getDbClient().query<{
    page_id: string;
    title: string;
    lat: number;
    lng: number;
    extract: string | null;
    raw_categories: string[] | null;
  }>(
    `SELECT u.page_id, u.title, u.lat, u.lng, u.extract, u.raw_categories
     FROM uncategorized_articles u
     LEFT JOIN article_category_overrides o ON o.page_id = u.page_id
     WHERE o.page_id IS NULL
     ORDER BY u.last_seen DESC, u.page_id
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    pageId: Number(r.page_id),
    title: r.title,
    lat: r.lat,
    lng: r.lng,
    extract: r.extract,
    rawCategories: r.raw_categories,
  }));
}
