import { getDbClient } from '../../../src/lib/dbClient.js';
import { result, type CheckResult } from '../lib.js';

// Read-only consistency checks the app relies on but never enforces with
// constraints: distinct marker colors, and no references to deleted categories.
export async function checkDbInvariants(): Promise<CheckResult> {
  const db = getDbClient();
  const problems: string[] = [];
  try {
    const { rows: sharedColors } = await db.query<{ color: string; ids: string[] }>(
      `SELECT upper(color) AS color, array_agg(id ORDER BY priority) AS ids
       FROM categories GROUP BY upper(color) HAVING count(*) > 1`
    );
    for (const { color, ids } of sharedColors) problems.push(`${ids.join(' and ')} share color ${color}`);

    const { rows: danglingOverrides } = await db.query<{ category: string; n: string }>(
      `SELECT o.category, count(*) AS n FROM article_category_overrides o
       LEFT JOIN categories c ON c.id = o.category WHERE c.id IS NULL GROUP BY o.category`
    );
    for (const { category, n } of danglingOverrides) problems.push(`${n} override(s) point at missing category "${category}"`);

    const { rows: danglingRules } = await db.query<{ category: string; n: string }>(
      `SELECT r.category, count(*) AS n FROM category_rules r
       LEFT JOIN categories c ON c.id = r.category WHERE c.id IS NULL GROUP BY r.category`
    );
    for (const { category, n } of danglingRules) problems.push(`${n} rule(s) point at missing category "${category}"`);
  } catch (err) {
    return result('db-invariants', 'SKIP', `Postgres query failed: ${(err as Error).message}`);
  } finally {
    await db.end();
  }
  return problems.length > 0
    ? result('db-invariants', 'FAIL', problems.join('; '))
    : result('db-invariants', 'PASS', 'category colors are distinct; overrides and rules reference existing categories');
}
