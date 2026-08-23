import { getDbClient } from './dbClient.js';
import { DEFAULT_CATEGORY_RULES, DEFAULT_TITLE_RULES } from './defaultCategoryRules.js';
import type { CategoryRuleRow } from './defaultCategoryRules.js';
import type { ArticleCategory } from './articleCategory.js';

let categoryRules: CategoryRuleRow[] = DEFAULT_CATEGORY_RULES;
let titleRules: CategoryRuleRow[] = DEFAULT_TITLE_RULES;

export function getCategoryRules(): CategoryRuleRow[] { return categoryRules; }
export function getTitleRules(): CategoryRuleRow[] { return titleRules; }

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS category_rules (
    id SERIAL PRIMARY KEY,
    match_type TEXT NOT NULL CHECK (match_type IN ('category', 'title')),
    keyword TEXT NOT NULL,
    category TEXT NOT NULL,
    priority INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_category_rules_lookup ON category_rules (match_type, priority);
`;

async function seedDefaults(db: ReturnType<typeof getDbClient>): Promise<void> {
  const rows: Array<[string, string, string, number]> = [
    ...DEFAULT_CATEGORY_RULES.map((r, i): [string, string, string, number] => ['category', r.keyword, r.category, i]),
    ...DEFAULT_TITLE_RULES.map((r, i): [string, string, string, number] => ['title', r.keyword, r.category, i]),
  ];
  const values = rows.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(', ');
  await db.query(`INSERT INTO category_rules (match_type, keyword, category, priority) VALUES ${values}`, rows.flat());
}

// Loads Wikipedia-category-to-OurGaia-category classification rules from
// Postgres so they're editable without a redeploy, auto-creating and
// seeding the table with the built-in defaults on first run against an
// empty database. If Postgres is unreachable, logs a warning and leaves the
// in-memory rules at their built-in defaults — same "degrade gracefully"
// pattern as the Redis cache elsewhere in this app.
export async function initCategoryRules(): Promise<void> {
  const db = getDbClient();
  try {
    await db.query(CREATE_TABLE_SQL);

    const { rows: countRows } = await db.query<{ count: string }>('SELECT COUNT(*) FROM category_rules');
    if (Number(countRows[0].count) === 0) {
      await seedDefaults(db);
      console.log('[categoryRules] seeded category_rules table with built-in defaults');
    }

    const { rows } = await db.query<{ match_type: 'category' | 'title'; keyword: string; category: ArticleCategory }>(
      'SELECT match_type, keyword, category FROM category_rules ORDER BY match_type, priority'
    );
    const loadedCategoryRules = rows.filter(r => r.match_type === 'category').map(r => ({ keyword: r.keyword, category: r.category }));
    const loadedTitleRules = rows.filter(r => r.match_type === 'title').map(r => ({ keyword: r.keyword, category: r.category }));

    if (loadedCategoryRules.length > 0) categoryRules = loadedCategoryRules;
    if (loadedTitleRules.length > 0) titleRules = loadedTitleRules;
    console.log(`[categoryRules] loaded ${loadedCategoryRules.length} category rules and ${loadedTitleRules.length} title rules from Postgres`);
  } catch (err) {
    console.warn('[categoryRules] Postgres unavailable, using built-in defaults:', (err as Error).message);
  }
}
