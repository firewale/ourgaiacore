import * as categories from './categories.js';
import type { CategoryStyle } from './categories.js';

let panelRef: HTMLElement | null = null;
let toggleBtnRef: HTMLButtonElement | null = null;

export function collapseLegend(): void {
  if (!panelRef || !toggleBtnRef) return;
  panelRef.hidden = true;
  toggleBtnRef.textContent = 'Legend ▲';
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

  bulkRow.appendChild(allBtn);
  bulkRow.appendChild(noneBtn);
  panel.appendChild(bulkRow);

  const rowsContainer = document.createElement('div');
  panel.appendChild(rowsContainer);

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

    // Edit mode swaps the swatch/label/pencil for an emoji input, a name
    // input, and save/cancel — same glyph+name shape as the add-category
    // form below, just inline on the row being edited.
    const glyphInput = document.createElement('input');
    glyphInput.type = 'text';
    glyphInput.className = 'legend-edit-glyph';
    glyphInput.maxLength = 4;
    glyphInput.hidden = true;
    glyphInput.setAttribute('aria-label', `${category.label} emoji`);

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
      editBtn.hidden = editing;
      glyphInput.hidden = !editing;
      labelInput.hidden = !editing;
      saveBtn.hidden = !editing;
      cancelBtn.hidden = !editing;
    }

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

  const glyphInput = document.createElement('input');
  glyphInput.type = 'text';
  glyphInput.className = 'legend-add-glyph';
  glyphInput.placeholder = '🏷️';
  glyphInput.maxLength = 4;
  glyphInput.setAttribute('aria-label', 'New category emoji');

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
