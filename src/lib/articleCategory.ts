// A category id, e.g. 'museum' or a user-added category's slug. Open-ended
// (not a closed union) because the valid set now lives in the `categories`
// table and is user-extensible at runtime — see lib/categories.ts, which is
// the source of truth for which ids are currently valid.
export type ArticleCategory = string;
