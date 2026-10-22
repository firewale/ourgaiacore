import { getDbClient } from './dbClient.js';
import type { ArticleCategory } from './articleCategory.js';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS article_category_overrides (
    page_id BIGINT PRIMARY KEY,
    category TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE article_category_overrides ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
`;

// Who set an override: a person via the marker popup, or an agent via the MCP
// set_article_category tool — kept so agent edits can be audited or reverted.
export type OverrideSource = 'manual' | 'agent';

// Runs the create/migrate SQL once per process — the ALTER takes an exclusive
// lock, so it mustn't run on every write. Retried on the next call if it fails
// (e.g. Postgres came up after the server).
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

export function _resetArticleCategoryOverridesForTests(): void {
  tableReady = undefined;
}

// Per-article manual overrides, keyed by Wikipedia pageId — these win over
// whatever the keyword-based classifier in categoryRules.ts would produce.
// Applied fresh on every request (never baked into the Redis caches) so an
// edit or its removal takes effect immediately regardless of cache state.
export async function initArticleCategoryOverrides(): Promise<void> {
  try {
    await ensureTable();
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

// Returns false when an agent write was refused because a person already set
// this article's category — manual overrides are never replaced by an agent.
export async function setCategoryOverride(
  pageId: number,
  category: ArticleCategory,
  source: OverrideSource = 'manual'
): Promise<boolean> {
  await ensureTable();
  const { rowCount } = await getDbClient().query(
    `INSERT INTO article_category_overrides (page_id, category, source, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (page_id) DO UPDATE SET category = EXCLUDED.category, source = EXCLUDED.source, updated_at = now()
     WHERE EXCLUDED.source = 'manual' OR article_category_overrides.source = 'agent'`,
    [pageId, category, source]
  );
  return rowCount === 1;
}
