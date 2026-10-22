import { getDbClient } from './dbClient.js';
import { DEFAULT_CATEGORIES, type CategoryDef } from './defaultCategories.js';

let categories: CategoryDef[] = DEFAULT_CATEGORIES;
let categoryIds: Set<string> = new Set(DEFAULT_CATEGORIES.map(c => c.id));

export function getCategories(): CategoryDef[] { return categories; }
export function isValidCategoryId(id: string): boolean { return categoryIds.has(id); }

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    glyph TEXT NOT NULL,
    color TEXT NOT NULL,
    priority INTEGER NOT NULL
  );
`;

async function seedDefaults(db: ReturnType<typeof getDbClient>): Promise<void> {
  const rows = DEFAULT_CATEGORIES.map((c, i): [string, string, string, string, number] => [c.id, c.label, c.glyph, c.color, i]);
  const values = rows.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(', ');
  await db.query(`INSERT INTO categories (id, label, glyph, color, priority) VALUES ${values}`, rows.flat());
}

// Loads the addable category list from Postgres, auto-creating and seeding
// the table with the built-in defaults on first run. Falls back to the
// built-in defaults (already the initial in-memory state) if Postgres is
// unreachable — same pattern as categoryRules.ts.
export async function initCategories(): Promise<void> {
  const db = getDbClient();
  try {
    await db.query(CREATE_TABLE_SQL);

    const { rows: countRows } = await db.query<{ count: string }>('SELECT COUNT(*) FROM categories');
    if (Number(countRows[0].count) === 0) {
      await seedDefaults(db);
      console.log('[categories] seeded categories table with built-in defaults');
    }

    const { rows } = await db.query<CategoryDef>('SELECT id, label, glyph, color FROM categories ORDER BY priority');
    if (rows.length > 0) {
      categories = rows;
      categoryIds = new Set(rows.map(c => c.id));
    }
    console.log(`[categories] loaded ${categories.length} categories from Postgres`);
  } catch (err) {
    console.warn('[categories] Postgres unavailable, using built-in defaults:', (err as Error).message);
  }
}

function slugify(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';
}

// Extra colors beyond the built-in categories' own, chosen to stay distinct
// from them so user-added categories don't reuse a built-in's color.
const EXTRA_COLORS = [
  '#D32F2F', '#827717', '#212121', '#26A69A', '#C0CA33',
  '#F06292', '#FFB300', '#8D6E63', '#FF7043', '#78909C',
  '#29B6F6', '#9CCC65', '#004D40', '#FDD835', '#AD7FA8',
];
const PALETTE = [...new Set([...DEFAULT_CATEGORIES.map(c => c.color), ...EXTRA_COLORS])];

// New categories take the first palette color no current category uses, so
// user-added categories stay visually consistent with the existing set
// without a manual color picker. Only once every color is taken does it cycle.
function nextColor(): string {
  const used = new Set(categories.map(c => c.color.toUpperCase()));
  return PALETTE.find(c => !used.has(c)) ?? PALETTE[categories.length % PALETTE.length];
}

export async function addCategory(label: string, glyph: string): Promise<CategoryDef> {
  const db = getDbClient();
  // Defensive: in case this is the very first write and startup init didn't
  // get a chance to create the table (e.g. Postgres came up late).
  await db.query(CREATE_TABLE_SQL);

  const baseId = slugify(label);
  let id = baseId;
  for (let suffix = 2; categoryIds.has(id); suffix++) id = `${baseId}-${suffix}`;

  const color = nextColor();
  const { rows: maxRows } = await db.query<{ max: number | null }>('SELECT MAX(priority) AS max FROM categories');
  const priority = (maxRows[0].max ?? -1) + 1;

  await db.query(
    'INSERT INTO categories (id, label, glyph, color, priority) VALUES ($1, $2, $3, $4, $5)',
    [id, label, glyph, color, priority]
  );

  const created: CategoryDef = { id, label, glyph, color };
  categories = [...categories, created];
  categoryIds.add(id);
  return created;
}

// Label and glyph are editable after creation; id and color are not — the id
// is referenced by category_rules/article_category_overrides, and the color
// is auto-assigned to keep the palette consistent (see nextColor()).
export async function updateCategory(id: string, updates: { label?: string; glyph?: string }): Promise<CategoryDef | null> {
  const existing = categories.find(c => c.id === id);
  if (!existing) return null;

  const label = updates.label ?? existing.label;
  const glyph = updates.glyph ?? existing.glyph;

  const db = getDbClient();
  await db.query(CREATE_TABLE_SQL);
  await db.query('UPDATE categories SET label = $1, glyph = $2 WHERE id = $3', [label, glyph, id]);

  const updated: CategoryDef = { ...existing, label, glyph };
  categories = categories.map(c => (c.id === id ? updated : c));
  return updated;
}
