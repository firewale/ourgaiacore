export interface CategoryDef {
  id: string;
  label: string;
  glyph: string;
  color: string;
}

// Built-in categories, seeded into the `categories` table on first run and
// used as the in-memory fallback if Postgres is unreachable. User-added
// categories (via POST /api/categories) live only in the table, appended
// after these. `default` is not included here — it's a special sentinel for
// "couldn't classify", kept hardcoded (see marker.ts / articleCategory.ts)
// rather than a real, addable/removable category.
export const DEFAULT_CATEGORIES: CategoryDef[] = [
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

// Fallback style for articles whose category couldn't be determined, or
// (transiently, client-side) a category id the client hasn't loaded yet.
export const DEFAULT_CATEGORY_STYLE: CategoryDef = {
  id: 'default',
  label: 'Uncategorized',
  glyph: '?',
  color: '#546E7A',
};
