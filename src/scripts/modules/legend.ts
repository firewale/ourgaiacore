import * as categories from './categories.js';
import type { CategoryStyle } from './categories.js';

let panelRef: HTMLElement | null = null;
let toggleBtnRef: HTMLButtonElement | null = null;

export function collapseLegend(): void {
  if (!panelRef || !toggleBtnRef) return;
  panelRef.hidden = true;
  toggleBtnRef.textContent = 'Legend ▲';
}

// A curated, general-purpose set of place/site emoji — not just the ones
// already used by built-in categories, so picking one doesn't force a
// visual duplicate of an existing category's glyph.
const EMOJI_OPTIONS = [
  '🏛️', '🏰', '🏯', '🏟️', '🏢', '🏬', '🏭', '🏥', '🏦', '🏨', '🏪', '🏫',
  '⛪', '🕌', '🕍', '🛕', '⛩️', '🏠', '🏚️', '🗼', '🗽', '⛲', '⛺',
  '🌳', '🌲', '🌵', '🌊', '🏔️', '⛰️', '🌋', '🏝️', '🌅', '🌄',
  '🚉', '✈️', '🚢', '🚂', '🌉', '⚓', '🚦',
  '🍽️', '☕', '🍺', '🍕', '🛍️',
  '🎨', '🎭', '🎬', '🎡', '🎢', '🎳', '🎾', '⚽', '🏈', '🎙️', '🎰', '🎉', '🎪',
  '👻', '🔮', '⚡', '🤝', '💻', '⚙️', '🥾', '⭐', '📍', '🗿', '💀',
  // Construction/transit infrastructure
  '🏗️', '🏤', '🚏', '🛤️', '🛣️', '🚧', '🕰️',
  // Animals & plants
  '🦌', '🦅', '🐻', '🦉', '🐺', '🦆', '🐢', '🐬', '🐠', '🦋', '🐝', '🌾', '🍄', '🌴', '🌸', '🍂',
  // Weather & elements
  '❄️', '☀️', '🌙', '🌈', '☔', '🔥', '🌀',
  // Water recreation
  '🏄', '🚤', '⛵', '🛶', '🎣', '🐚',
  // Sports & games
  '🏀', '⚾', '🏐', '🏓', '🏸', '🥊', '🎿', '🏂', '🎯', '🎮',
  // Music & instruments
  '🎼', '🎹', '🎸', '🥁',
];

// A single shared picker popover, reused across every glyph input in the
// legend (the add-category form and every row's inline editor) — same
// approach as marker.ts's shared map popup. Positioned with `fixed`
// coordinates computed from the triggering button, so it escapes the
// legend panel's own `overflow-y: auto` clipping.
//
// Opened only via each glyph field's dedicated picker button, never by
// focusing/clicking the text input itself — on a touch device, focusing a
// text input also raises the OS keyboard, and having that pop up underneath
// the picker at the same time looked broken. The text input stays focusable
// and editable for typing/pasting a custom emoji; focusing it explicitly
// closes the picker first, so the two never show at once.
let pickerEl: HTMLElement | null = null;
let activePickerInput: HTMLInputElement | null = null;
let activePickerAnchor: HTMLElement | null = null;

function closeGlyphPicker(): void {
  if (pickerEl) pickerEl.hidden = true;
  activePickerInput = null;
  activePickerAnchor = null;
}

// Emoji comparisons ignore the variation-selector-16 suffix (U+FE0F) some of
// EMOJI_OPTIONS uses for text-vs-emoji rendering — several built-in
// categories store the same glyph without it (e.g. museum's plain '🏛' vs
// this file's '🏛️'), so a naive string match would miss that overlap.
function normalizeGlyph(glyph: string): string {
  return glyph.replace(/\uFE0F/g, '');
}

function getGlyphPicker(): HTMLElement {
  if (pickerEl) return pickerEl;

  const picker = document.createElement('div');
  picker.className = 'legend-glyph-picker';
  picker.hidden = true;
  document.body.appendChild(picker);
  pickerEl = picker;

  document.addEventListener('mousedown', (e) => {
    if (!pickerEl || pickerEl.hidden) return;
    const target = e.target as Node;
    if (pickerEl.contains(target) || activePickerAnchor?.contains(target)) return;
    closeGlyphPicker();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pickerEl && !pickerEl.hidden) closeGlyphPicker();
  });

  return picker;
}

// Rebuilds the picker's option grid, leaving out glyphs already used by
// another category — so picking one can't create a visual duplicate on the
// map. `excludeCategoryId` (the category being edited, if any) keeps that
// row's own current glyph selectable rather than hiding it as "taken by
// itself". Called fresh on every open since the taken set changes as
// categories get added/edited during the session.
function renderGlyphOptions(picker: HTMLElement, excludeCategoryId?: string): void {
  const taken = new Set(
    categories.getCategories()
      .filter((c) => c.id !== excludeCategoryId)
      .map((c) => normalizeGlyph(c.glyph))
  );

  picker.replaceChildren();
  for (const emoji of EMOJI_OPTIONS) {
    if (taken.has(normalizeGlyph(emoji))) continue;

    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'legend-glyph-option';
    option.textContent = emoji;
    option.setAttribute('aria-label', `Use ${emoji}`);
    // mousedown (not click), with preventDefault, so selecting an option
    // never shifts focus first — the value just updates in place instead of
    // the picker closing (via the outside-click handler below) before the
    // click lands.
    option.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (activePickerInput) {
        activePickerInput.value = emoji;
        activePickerInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      closeGlyphPicker();
    });
    picker.appendChild(option);
  }
}

function openGlyphPickerFor(input: HTMLInputElement, anchor: HTMLElement, excludeCategoryId?: string): void {
  const picker = getGlyphPicker();
  activePickerInput = input;
  activePickerAnchor = anchor;
  renderGlyphOptions(picker, excludeCategoryId);

  // Measure with the picker laid out but invisible, so getBoundingClientRect
  // reflects its real size (a `hidden` element reports zero) before deciding
  // which side of the anchor it fits on.
  picker.style.visibility = 'hidden';
  picker.hidden = false;
  const pickerRect = picker.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();

  const opensUp = anchorRect.bottom + pickerRect.height + 4 > window.innerHeight;
  const top = opensUp ? anchorRect.top - pickerRect.height - 4 : anchorRect.bottom + 4;
  const left = Math.min(anchorRect.left, window.innerWidth - pickerRect.width - 8);

  picker.style.position = 'fixed';
  picker.style.top = `${Math.max(4, top)}px`;
  picker.style.left = `${Math.max(4, left)}px`;
  picker.style.visibility = 'visible';
}

// Creates the 🙂 button that opens the shared picker for `input`, and wires
// the input itself to close the picker if the user focuses it directly to
// type/paste instead (see the block comment above `pickerEl`). Caller is
// responsible for inserting the returned button into the DOM next to `input`.
// `excludeCategoryId` — pass the category being edited (if any) so its own
// current glyph isn't filtered out of the grid as "already taken".
function attachGlyphPicker(input: HTMLInputElement, excludeCategoryId?: string): HTMLButtonElement {
  const pickerBtn = document.createElement('button');
  pickerBtn.type = 'button';
  pickerBtn.className = 'legend-glyph-picker-btn';
  pickerBtn.textContent = '🙂';
  pickerBtn.title = 'Choose an emoji';
  pickerBtn.setAttribute('aria-label', 'Choose an emoji');
  pickerBtn.addEventListener('click', (e) => {
    e.preventDefault();
    // Toggle: clicking the button that already has the picker open closes
    // it again, rather than just re-rendering it in place. Clicking a
    // different field's button while one is open still switches to that
    // field instead of requiring a close-then-open.
    const alreadyOpenHere = pickerEl && !pickerEl.hidden && activePickerAnchor === pickerBtn;
    if (alreadyOpenHere) {
      closeGlyphPicker();
      return;
    }
    openGlyphPickerFor(input, pickerBtn, excludeCategoryId);
  });
  pickerBtn.addEventListener('blur', () => {
    setTimeout(() => {
      if (activePickerAnchor === pickerBtn) closeGlyphPicker();
    }, 0);
  });

  input.addEventListener('focus', () => closeGlyphPicker());

  return pickerBtn;
}

export function buildLegend(
  container: HTMLElement,
  onToggle: (category: string, enabled: boolean) => void,
  onOpen?: () => void
): void {
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'legend-toggle';
  toggleBtn.textContent = 'Legend ▲';
  toggleBtn.title = 'Toggle category legend';

  const panel = document.createElement('div');
  panel.id = 'legend';
  panel.hidden = true;

  const heading = document.createElement('h3');
  heading.textContent = 'Categories';
  panel.appendChild(heading);

  const bulkRow = document.createElement('div');
  bulkRow.className = 'legend-bulk-row';

  const checkboxes: HTMLInputElement[] = [];

  const allBtn = document.createElement('button');
  allBtn.className = 'legend-bulk-btn';
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => {
    checkboxes.forEach((cb) => {
      if (!cb.checked) { cb.checked = true; onToggle(cb.dataset.category!, true); }
    });
  });

  const noneBtn = document.createElement('button');
  noneBtn.className = 'legend-bulk-btn';
  noneBtn.textContent = 'None';
  noneBtn.addEventListener('click', () => {
    checkboxes.forEach((cb) => {
      if (cb.checked) { cb.checked = false; onToggle(cb.dataset.category!, false); }
    });
  });

  const editModeBtn = document.createElement('button');
  editModeBtn.type = 'button';
  editModeBtn.className = 'legend-bulk-btn';
  editModeBtn.textContent = '✏️ Edit';
  editModeBtn.setAttribute('aria-pressed', 'false');

  bulkRow.appendChild(allBtn);
  bulkRow.appendChild(noneBtn);
  bulkRow.appendChild(editModeBtn);
  panel.appendChild(bulkRow);

  const rowsContainer = document.createElement('div');
  panel.appendChild(rowsContainer);

  // Edit mode is off by default — pencils and the add-category form below are
  // only shown once the user opts in via editModeBtn, keeping the legend a
  // clean toggle-list the rest of the time.
  let editMode = false;
  // Each row's `() => setEditing(false)` — re-running these both collapses any
  // row currently mid-edit AND (since setEditing's hidden calc factors in the
  // current editMode) recomputes every pencil's visibility. Safe to call on
  // either toggle direction.
  const exitRowEditFns: Array<() => void> = [];

  function addRow(category: CategoryStyle): void {
    const row = document.createElement('label');
    row.className = 'legend-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.className = 'legend-checkbox';
    checkbox.dataset.category = category.id;
    checkbox.addEventListener('change', () => onToggle(category.id, checkbox.checked));
    checkboxes.push(checkbox);

    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = category.color;
    swatch.textContent = category.glyph;

    const labelText = document.createElement('span');
    labelText.className = 'legend-label';
    labelText.textContent = category.label;

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'legend-edit-btn';
    editBtn.textContent = '✏️';
    editBtn.title = 'Edit category';
    editBtn.setAttribute('aria-label', `Edit ${category.label}`);
    editBtn.hidden = !editMode;

    // Edit mode swaps the swatch/label/pencil for an emoji input, a name
    // input, and save/cancel — same glyph+name shape as the add-category
    // form below, just inline on the row being edited.
    const glyphInput = document.createElement('input');
    glyphInput.type = 'text';
    glyphInput.className = 'legend-edit-glyph';
    glyphInput.maxLength = 4;
    glyphInput.hidden = true;
    glyphInput.setAttribute('aria-label', `${category.label} emoji`);
    const glyphPickerBtn = attachGlyphPicker(glyphInput, category.id);
    glyphPickerBtn.hidden = true;

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'legend-edit-label';
    labelInput.maxLength = 40;
    labelInput.hidden = true;
    labelInput.setAttribute('aria-label', `${category.label} name`);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'legend-edit-save';
    saveBtn.textContent = '✓';
    saveBtn.title = 'Save';
    saveBtn.hidden = true;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'legend-edit-cancel';
    cancelBtn.textContent = '✕';
    cancelBtn.title = 'Cancel';
    cancelBtn.hidden = true;

    function setEditing(editing: boolean): void {
      swatch.hidden = editing;
      labelText.hidden = editing;
      editBtn.hidden = editing || !editMode;
      glyphInput.hidden = !editing;
      glyphPickerBtn.hidden = !editing;
      labelInput.hidden = !editing;
      saveBtn.hidden = !editing;
      cancelBtn.hidden = !editing;
      if (!editing) closeGlyphPicker();
    }
    exitRowEditFns.push(() => setEditing(false));

    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      glyphInput.value = category.glyph;
      labelInput.value = category.label;
      setEditing(true);
      labelInput.focus();
    });

    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setEditing(false);
    });

    saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const newLabel = labelInput.value.trim();
      const newGlyph = glyphInput.value.trim();
      if (!newLabel || !newGlyph) return;
      if (newLabel === category.label && newGlyph === category.glyph) { setEditing(false); return; }

      saveBtn.disabled = true;
      const updated = await categories.updateCategory(category.id, { label: newLabel, glyph: newGlyph });
      saveBtn.disabled = false;

      if (updated) {
        category.label = updated.label;
        category.glyph = updated.glyph;
        labelText.textContent = updated.label;
        swatch.textContent = updated.glyph;
        editBtn.setAttribute('aria-label', `Edit ${updated.label}`);
      }
      setEditing(false);
    });

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(labelText);
    row.appendChild(editBtn);
    row.appendChild(glyphInput);
    row.appendChild(glyphPickerBtn);
    row.appendChild(labelInput);
    row.appendChild(saveBtn);
    row.appendChild(cancelBtn);
    rowsContainer.appendChild(row);
  }

  for (const category of categories.getCategories()) addRow(category);

  // Compact add-category form: an emoji glyph plus a label, styled to match
  // the existing rows above it — new categories always start shown (like
  // every other row) and get their color auto-assigned by the server.
  const addForm = document.createElement('form');
  addForm.className = 'legend-add-form';
  addForm.hidden = !editMode;

  const glyphInput = document.createElement('input');
  glyphInput.type = 'text';
  glyphInput.className = 'legend-add-glyph';
  glyphInput.placeholder = '🏷️';
  glyphInput.maxLength = 4;
  glyphInput.setAttribute('aria-label', 'New category emoji');
  const glyphPickerBtn = attachGlyphPicker(glyphInput);

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'legend-add-label';
  labelInput.placeholder = 'Add category…';
  labelInput.maxLength = 40;
  labelInput.setAttribute('aria-label', 'New category name');

  const addBtn = document.createElement('button');
  addBtn.type = 'submit';
  addBtn.className = 'legend-add-btn';
  addBtn.textContent = '+';
  addBtn.title = 'Add category';

  const error = document.createElement('div');
  error.className = 'legend-add-error';
  error.hidden = true;

  addForm.appendChild(glyphInput);
  addForm.appendChild(glyphPickerBtn);
  addForm.appendChild(labelInput);
  addForm.appendChild(addBtn);
  panel.appendChild(addForm);
  panel.appendChild(error);

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = labelInput.value.trim();
    const glyph = glyphInput.value.trim();
    error.hidden = true;

    if (!label || !glyph) {
      error.textContent = 'Enter both an emoji and a name.';
      error.hidden = false;
      return;
    }

    addBtn.disabled = true;
    const category = await categories.addCategory(label, glyph);
    addBtn.disabled = false;

    if (!category) {
      error.textContent = 'Could not add category — try again.';
      error.hidden = false;
      return;
    }

    addRow(category);
    onToggle(category.id, true);
    labelInput.value = '';
    glyphInput.value = '';
    glyphInput.focus();
  });

  editModeBtn.addEventListener('click', () => {
    editMode = !editMode;
    editModeBtn.textContent = editMode ? '✓ Done' : '✏️ Edit';
    editModeBtn.setAttribute('aria-pressed', String(editMode));

    if (!editMode) {
      glyphInput.value = '';
      labelInput.value = '';
      error.hidden = true;
      closeGlyphPicker();
    }
    addForm.hidden = !editMode;
    // Re-running every row's exit-edit function both collapses any row still
    // mid-edit and recomputes its pencil's visibility for the new editMode.
    exitRowEditFns.forEach((exit) => exit());
  });

  toggleBtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggleBtn.textContent = panel.hidden ? 'Legend ▲' : 'Legend ▼';
    if (!panel.hidden) onOpen?.();
  });

  container.appendChild(toggleBtn);
  container.appendChild(panel);

  panelRef = panel;
  toggleBtnRef = toggleBtn;
}
