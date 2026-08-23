import { getDbClient } from './dbClient.js';
import type { ArticleCategory } from './articleCategory.js';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS article_category_overrides (
    page_id BIGINT PRIMARY KEY,
    category TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

// Per-article manual overrides, keyed by Wikipedia pageId — these win over
// whatever the keyword-based classifier in categoryRules.ts would produce.
// Applied fresh on every request (never baked into the Redis caches) so an
// edit or its removal takes effect immediately regardless of cache state.
export async function initArticleCategoryOverrides(): Promise<void> {
  try {
    await getDbClient().query(CREATE_TABLE_SQL);
    console.log('[articleCategoryOverrides] table ready');
  } catch (err) {
    console.warn('[articleCategoryOverrides] Postgres unavailable at startup:', (err as Error).message);
  }
}

export async function getCategoryOverrides(pageIds: number[]): Promise<Map<number, ArticleCategory>> {
  if (pageIds.length === 0) return new Map();
  try {
    const { rows } = await getDbClient().query<{ page_id: string; category: ArticleCategory }>(
      'SELECT page_id, category FROM article_category_overrides WHERE page_id = ANY($1)',
      [pageIds]
    );
    return new Map(rows.map(r => [Number(r.page_id), r.category]));
  } catch (err) {
    console.warn('[articleCategoryOverrides] failed to load overrides:', (err as Error).message);
    return new Map();
  }
}

export async function setCategoryOverride(pageId: number, category: ArticleCategory): Promise<void> {
  const db = getDbClient();
  // Defensive: in case this is the very first write and the startup init
  // didn't get a chance to create the table (e.g. Postgres came up late).
  await db.query(CREATE_TABLE_SQL);
  await db.query(
    `INSERT INTO article_category_overrides (page_id, category, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (page_id) DO UPDATE SET category = EXCLUDED.category, updated_at = now()`,
    [pageId, category]
  );
}
