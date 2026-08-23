export interface CategoryStyle {
  id: string;
  label: string;
  glyph: string;
  color: string;
}

// Mirrors the backend's built-in defaults (src/lib/defaultCategories.ts) so
// markers/legend/popups render correctly before loadCategories() resolves,
// and so the app still works if the fetch fails outright. Once loaded, the
// server's list (built-ins + any user-added categories) takes over.
const BUILTIN_CATEGORIES: CategoryStyle[] = [
  { id: 'museum', label: 'Museum', glyph: '🏛', color: '#9C27B0' },
  { id: 'worship', label: 'Worship', glyph: '⛪', color: '#5C6BC0' },
  { id: 'park', label: 'Park', glyph: '🌳', color: '#388E3C' },
  { id: 'historic', label: 'Historic', glyph: '🏰', color: '#795548' },
  { id: 'education', label: 'Education', glyph: '🎓', color: '#0288D1' },
  { id: 'transport', label: 'Transport', glyph: '🚉', color: '#F57C00' },
  { id: 'city', label: 'City', glyph: '🏙', color: '#00897B' },
  { id: 'demolished', label: 'Demolished', glyph: '🏚', color: '#616161' },
  { id: 'shopping', label: 'Shopping', glyph: '🛍', color: '#E91E63' },
  { id: 'ghost-town', label: 'Ghost Town', glyph: '👻', color: '#4A148C' },
  { id: 'waterway', label: 'Waterway', glyph: '🌊', color: '#0277BD' },
  { id: 'neighborhood', label: 'Neighborhood', glyph: '🏘', color: '#FF8F00' },
  { id: 'plane-crash', label: 'Plane Crash', glyph: '✈', color: '#B71C1C' },
  { id: 'hospital', label: 'Hospital', glyph: '🏥', color: '#00838F' },
  { id: 'landform', label: 'Landform', glyph: '⛰', color: '#6D4C41' },
  { id: 'urban-legend', label: 'Urban Legend', glyph: '🔮', color: '#4527A0' },
  { id: 'food-and-drink', label: 'Food and Drink', glyph: '🍽', color: '#EF6C00' },
  { id: 'art', label: 'Art', glyph: '🎨', color: '#AD1457' },
  { id: 'natural-disaster', label: 'Natural Disaster', glyph: '⚡', color: '#E65100' },
  { id: 'sport', label: 'Sport', glyph: '🎾', color: '#2E7D32' },
  { id: 'infrastructure', label: 'Infrastructure', glyph: '⚙', color: '#455A64' },
  { id: 'event', label: 'Event', glyph: '🎉', color: '#7B1FA2' },
  { id: 'industry', label: 'Industry', glyph: '🏭', color: '#5D4037' },
  { id: 'community', label: 'Community', glyph: '🤝', color: '#00695C' },
  { id: 'maritime', label: 'Maritime', glyph: '⚓', color: '#01579B' },
  { id: 'tech', label: 'Tech', glyph: '💻', color: '#1565C0' },
  { id: 'performing-arts', label: 'Performing Arts', glyph: '🎭', color: '#880E4F' },
  { id: 'trail', label: 'Trail', glyph: '🥾', color: '#558B2F' },
  { id: 'recording-studio', label: 'Recording Studio', glyph: '🎙', color: '#4A148C' },
  { id: 'entertainment', label: 'Entertainment', glyph: '🎰', color: '#F9A825' },
];

const DEFAULT_STYLE: CategoryStyle = { id: 'default', label: 'Uncategorized', glyph: '?', color: '#546E7A' };

let categories: CategoryStyle[] = BUILTIN_CATEGORIES;
let byId: Map<string, CategoryStyle> = new Map(BUILTIN_CATEGORIES.map(c => [c.id, c]));

// Fetches the live category list (built-ins + any user-added categories)
// from the server. Safe to call once at startup — on failure this just
// leaves the built-in fallback in place rather than throwing.
export async function loadCategories(): Promise<void> {
  try {
    const res = await fetch('/api/categories');
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json() as CategoryStyle[];
    if (data.length > 0) {
      categories = data;
      byId = new Map(data.map(c => [c.id, c]));
    }
  } catch (err) {
    console.error('Failed to load categories, using built-in defaults:', err);
  }
}

export function getCategories(): CategoryStyle[] { return categories; }

export function getCategoryStyle(id: string): CategoryStyle {
  return byId.get(id) ?? DEFAULT_STYLE;
}

export async function addCategory(label: string, glyph: string): Promise<CategoryStyle | null> {
  try {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, glyph }),
    });
    if (!res.ok) {
      console.error('Failed to add category:', res.status);
      return null;
    }
    const category = await res.json() as CategoryStyle;
    categories = [...categories, category];
    byId.set(category.id, category);
    return category;
  } catch (err) {
    console.error('Add category request failed:', err);
    return null;
  }
}

export async function updateCategory(id: string, updates: { label?: string; glyph?: string }): Promise<CategoryStyle | null> {
  try {
    const res = await fetch(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      console.error('Failed to update category:', res.status);
      return null;
    }
    const category = await res.json() as CategoryStyle;
    categories = categories.map((c) => (c.id === category.id ? category : c));
    byId.set(category.id, category);
    return category;
  } catch (err) {
    console.error('Update category request failed:', err);
    return null;
  }
}
