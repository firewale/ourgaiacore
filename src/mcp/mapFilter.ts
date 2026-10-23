import { getCategories } from '../lib/categories.js';
import { isMapOpen, publish, unknownMapError, type FilterMode } from '../lib/mapEvents.js';

export type FilterMapResult =
  | { ok: true; mode: FilterMode; categories: Array<{ id: string; label: string }> }
  | { ok: false; error: string };

// Models (especially small ones) tend to say "museums", "Food and Drink" or
// just "food" rather than the exact id, so match on id or label,
// case-insensitively, with a trailing plural dropped — falling back to a
// single word of a label ("food" → Food and Drink) when only one category has it.
// Models also name places of worship by type ("churches"), so those map to worship.
const SYNONYMS: Record<string, string> = {
  church: 'worship',
  chapel: 'worship',
  cathedral: 'worship',
  temple: 'worship',
  mosque: 'worship',
  synagogue: 'worship',
  shrine: 'worship',
};

// Words too common to pick a category by on their own ("and" in "Food and Drink").
const FILLER_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'or', 'for', 'in', 'on', 'at', 'to', '&']);

export function resolveCategory(name: string): { id: string; label: string } | undefined {
  const key = name.trim().toLowerCase();
  const candidates = [key, key.replace(/\s+/g, '-'), key.replace(/es$/, ''), key.replace(/s$/, '')];
  const all = getCategories();
  const exact = all.find((c) => candidates.includes(c.id) || candidates.includes(c.label.toLowerCase()));
  if (exact) return exact;

  const synonymId = candidates.map((k) => SYNONYMS[k]).find(Boolean);
  const synonym = synonymId && all.find((c) => c.id === synonymId);
  if (synonym) return synonym;

  const byWord = all.filter((c) =>
    c.label.toLowerCase().split(/\s+/).some((word) => !FILLER_WORDS.has(word) && candidates.includes(word))
  );
  return byWord.length === 1 ? byWord[0] : undefined;
}

// Version-independent core of the filter_map tool — see navigation.ts.
// 'only' shows just the given categories, 'show' / 'hide' adjust them on top
// of the current filter, and 'all' clears the filter. Only the map named by
// mapId changes.
export function filterMap(mapId: string, mode: FilterMode, names: string[] = []): FilterMapResult {
  if (mode !== 'all' && names.length === 0) {
    return { ok: false, error: `Mode "${mode}" needs at least one category.` };
  }

  const resolved: Array<{ id: string; label: string }> = [];
  const unknown: string[] = [];
  for (const name of mode === 'all' ? [] : names) {
    const match = resolveCategory(name);
    if (!match) unknown.push(name);
    else if (!resolved.some((c) => c.id === match.id)) resolved.push({ id: match.id, label: match.label });
  }
  if (unknown.length > 0) {
    const ids = getCategories().map((c) => c.id).join(', ');
    return { ok: false, error: `Unknown categor${unknown.length === 1 ? 'y' : 'ies'}: ${unknown.join(', ')}. Valid ids: ${ids}.` };
  }
  if (!isMapOpen(mapId)) return { ok: false, error: unknownMapError(mapId) };

  publish(mapId, { type: 'filter', mode, categories: resolved.map((c) => c.id) });
  return { ok: true, mode, categories: resolved };
}
