import { Router } from 'express';
import { getCategories, addCategory, updateCategory } from '../lib/categories.js';

export const categoriesRouter = Router();

function readString(body: unknown, field: string): string | undefined {
  const value = (body as Record<string, unknown> | undefined)?.[field];
  return typeof value === 'string' ? value.trim() : undefined;
}

// Returns an error message if `value` isn't a usable label/glyph, else undefined.
function validationError(field: 'label' | 'glyph', value: string): string | undefined {
  if (!value) return `${field} is required`;
  if (field === 'label' && value.length > 40) return 'label must be 40 characters or fewer';
  if (field === 'glyph' && [...value].length > 4) return 'glyph must be a short emoji';
  return undefined;
}

categoriesRouter.get('/', (_req, res) => {
  res.json(getCategories());
});

categoriesRouter.post('/', async (req, res) => {
  const label = readString(req.body, 'label') ?? '';
  const glyph = readString(req.body, 'glyph') ?? '';

  const labelError = validationError('label', label);
  if (labelError) { res.status(400).json({ error: labelError }); return; }
  const glyphError = validationError('glyph', glyph);
  if (glyphError) { res.status(400).json({ error: glyphError }); return; }

  try {
    const category = await addCategory(label, glyph);
    res.status(201).json(category);
  } catch (err) {
    console.error('[categories] Failed to add category:', err);
    res.status(503).json({ error: 'Could not save category — database unavailable' });
  }
});

categoriesRouter.patch('/:id', async (req, res) => {
  const label = readString(req.body, 'label');
  const glyph = readString(req.body, 'glyph');

  if (label === undefined && glyph === undefined) {
    res.status(400).json({ error: 'label or glyph is required' });
    return;
  }
  if (label !== undefined) {
    const labelError = validationError('label', label);
    if (labelError) { res.status(400).json({ error: labelError }); return; }
  }
  if (glyph !== undefined) {
    const glyphError = validationError('glyph', glyph);
    if (glyphError) { res.status(400).json({ error: glyphError }); return; }
  }

  try {
    const category = await updateCategory(req.params.id, { label, glyph });
    if (!category) { res.status(404).json({ error: 'category not found' }); return; }
    res.json(category);
  } catch (err) {
    console.error('[categories] Failed to update category:', err);
    res.status(503).json({ error: 'Could not update category — database unavailable' });
  }
});
