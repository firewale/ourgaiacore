import { getCategories, isValidCategoryId } from '../lib/categories.js';
import { setCategoryOverride } from '../lib/articleCategoryOverrides.js';
import { listUncategorized, removeUncategorized } from '../lib/uncategorizedArticles.js';
import { stripHtml } from '../lib/rag.js';

export const DEFAULT_LIST_LIMIT = 20;
const MAX_EXTRACT_CHARS = 500;

export interface UncategorizedArticleView {
  pageId: number;
  title: string;
  lat: number;
  lng: number;
  extract: string;
  rawCategories: string[];
}

export type ListUncategorizedResult =
  | { ok: true; articles: UncategorizedArticleView[]; categories: Array<{ id: string; label: string }> }
  | { ok: false; error: string };

export type SetArticleCategoryResult =
  | { ok: true; pageId: number; category: string }
  | { ok: false; error: string };

// Version-independent cores of the categorization tools — see navigation.ts.
// The valid category list is returned alongside the articles so an agent can
// pick an id without a second round trip.
export async function listUncategorizedArticles(limit = DEFAULT_LIST_LIMIT): Promise<ListUncategorizedResult> {
  let rows;
  try {
    rows = await listUncategorized(limit);
  } catch {
    return { ok: false, error: 'The article database is unavailable right now.' };
  }
  return {
    ok: true,
    articles: rows.map((r) => ({
      pageId: r.pageId,
      title: r.title,
      lat: r.lat,
      lng: r.lng,
      extract: r.extract ? stripHtml(r.extract).slice(0, MAX_EXTRACT_CHARS) : '',
      rawCategories: r.rawCategories ?? [],
    })),
    categories: getCategories().map(({ id, label }) => ({ id, label })),
  };
}

export async function setArticleCategory(pageId: number, category: string): Promise<SetArticleCategoryResult> {
  if (!isValidCategoryId(category)) {
    const ids = getCategories().map((c) => c.id).join(', ');
    return { ok: false, error: `"${category}" is not a valid category id. Valid ids: ${ids}.` };
  }
  try {
    const saved = await setCategoryOverride(pageId, category, 'agent');
    if (!saved) {
      return { ok: false, error: `Article ${pageId} already has a category set by a person; leaving it unchanged.` };
    }
    await removeUncategorized([pageId]);
  } catch {
    return { ok: false, error: 'The article database is unavailable right now.' };
  }
  return { ok: true, pageId, category };
}
