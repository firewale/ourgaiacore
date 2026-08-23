import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildLegend, collapseLegend } from '../legend.js';
import { getCategories } from '../categories.js';
import * as categoriesModule from '../categories.js';

let container: HTMLElement;
let onToggle: ReturnType<typeof vi.fn>;

beforeEach(() => {
  container = document.createElement('div');
  onToggle = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function checkboxFor(category: string): HTMLInputElement {
  return container.querySelector(`.legend-checkbox[data-category="${category}"]`)!;
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function editModeBtn(): HTMLButtonElement {
  return Array.from(container.querySelectorAll('.legend-bulk-btn')).find(
    (btn) => btn.textContent === '✏️ Edit' || btn.textContent === '✓ Done'
  ) as HTMLButtonElement;
}

describe('buildLegend', () => {
  it('renders a toggle button and a hidden panel', () => {
    buildLegend(container, onToggle);
    const toggleBtn = container.querySelector('#legend-toggle');
    const panel = container.querySelector('#legend');
    expect(toggleBtn).not.toBeNull();
    expect((panel as HTMLElement).hidden).toBe(true);
  });

  it('shows and hides the panel when the toggle button is clicked', () => {
    buildLegend(container, onToggle);
    const toggleBtn = container.querySelector('#legend-toggle') as HTMLButtonElement;
    const panel = container.querySelector('#legend') as HTMLElement;

    toggleBtn.click();
    expect(panel.hidden).toBe(false);

    toggleBtn.click();
    expect(panel.hidden).toBe(true);
  });

  it('renders one checkbox row per category, excluding "default"', () => {
    buildLegend(container, onToggle);
    const rows = container.querySelectorAll('.legend-checkbox');
    expect(rows.length).toBe(getCategories().length);
    expect(container.querySelector('.legend-checkbox[data-category="default"]')).toBeNull();
  });

  it('renders each category\'s label', () => {
    buildLegend(container, onToggle);
    const labels = Array.from(container.querySelectorAll('.legend-label')).map((el) => el.textContent);
    expect(labels).toContain('Ghost Town');
    expect(labels).toContain('Museum');
  });

  it('checkboxes start checked and swatches use the category color and glyph', () => {
    buildLegend(container, onToggle);
    const museumCheckbox = checkboxFor('museum');
    expect(museumCheckbox.checked).toBe(true);

    const museum = getCategories().find((c) => c.id === 'museum')!;
    const swatch = museumCheckbox.parentElement!.querySelector('.legend-swatch') as HTMLElement;
    expect(swatch.style.backgroundColor).toBe(hexToRgb(museum.color));
    expect(swatch.textContent).toBe(museum.glyph);
  });

  it('calls onToggle with the category and checked state when a checkbox changes', () => {
    buildLegend(container, onToggle);
    const museumCheckbox = checkboxFor('museum');

    museumCheckbox.checked = false;
    museumCheckbox.dispatchEvent(new Event('change'));
    expect(onToggle).toHaveBeenCalledWith('museum', false);

    museumCheckbox.checked = true;
    museumCheckbox.dispatchEvent(new Event('change'));
    expect(onToggle).toHaveBeenCalledWith('museum', true);
  });

  it('"None" button unchecks all checked boxes and calls onToggle for each', () => {
    buildLegend(container, onToggle);
    const noneBtn = Array.from(container.querySelectorAll('.legend-bulk-btn')).find(
      (btn) => btn.textContent === 'None'
    ) as HTMLButtonElement;

    noneBtn.click();

    const checkboxes = container.querySelectorAll<HTMLInputElement>('.legend-checkbox');
    checkboxes.forEach((cb) => expect(cb.checked).toBe(false));
    expect(onToggle).toHaveBeenCalledTimes(checkboxes.length);
    expect(onToggle).toHaveBeenCalledWith('museum', false);
  });

  it('"All" button re-checks all boxes and calls onToggle for each', () => {
    buildLegend(container, onToggle);
    const noneBtn = Array.from(container.querySelectorAll('.legend-bulk-btn')).find(
      (btn) => btn.textContent === 'None'
    ) as HTMLButtonElement;
    const allBtn = Array.from(container.querySelectorAll('.legend-bulk-btn')).find(
      (btn) => btn.textContent === 'All'
    ) as HTMLButtonElement;

    noneBtn.click();
    onToggle.mockClear();
    allBtn.click();

    const checkboxes = container.querySelectorAll<HTMLInputElement>('.legend-checkbox');
    checkboxes.forEach((cb) => expect(cb.checked).toBe(true));
    expect(onToggle).toHaveBeenCalledTimes(checkboxes.length);
    expect(onToggle).toHaveBeenCalledWith('museum', true);
  });

  it('"All" button is a no-op for already-checked boxes', () => {
    buildLegend(container, onToggle);
    const allBtn = Array.from(container.querySelectorAll('.legend-bulk-btn')).find(
      (btn) => btn.textContent === 'All'
    ) as HTMLButtonElement;

    allBtn.click();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('calls onOpen when the panel is opened but not when closed', () => {
    const onOpen = vi.fn();
    buildLegend(container, onToggle, onOpen);
    const toggleBtn = container.querySelector('#legend-toggle') as HTMLButtonElement;

    toggleBtn.click();
    expect(onOpen).toHaveBeenCalledOnce();

    toggleBtn.click();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('collapseLegend hides the panel', () => {
    buildLegend(container, onToggle);
    const toggleBtn = container.querySelector('#legend-toggle') as HTMLButtonElement;
    const panel = container.querySelector('#legend') as HTMLElement;

    toggleBtn.click();
    expect(panel.hidden).toBe(false);

    collapseLegend();
    expect(panel.hidden).toBe(true);
  });

  it('flips the toggle button arrow to reflect open/closed state', () => {
    buildLegend(container, onToggle);
    const toggleBtn = container.querySelector('#legend-toggle') as HTMLButtonElement;

    expect(toggleBtn.textContent).toBe('Legend ▲');

    toggleBtn.click();
    expect(toggleBtn.textContent).toBe('Legend ▼');

    toggleBtn.click();
    expect(toggleBtn.textContent).toBe('Legend ▲');
  });

  it('collapseLegend resets the toggle button arrow', () => {
    buildLegend(container, onToggle);
    const toggleBtn = container.querySelector('#legend-toggle') as HTMLButtonElement;

    toggleBtn.click();
    expect(toggleBtn.textContent).toBe('Legend ▼');

    collapseLegend();
    expect(toggleBtn.textContent).toBe('Legend ▲');
  });

  it('hides pencils and the add-category form by default', () => {
    buildLegend(container, onToggle);

    container.querySelectorAll<HTMLElement>('.legend-edit-btn').forEach((btn) => {
      expect(btn.hidden).toBe(true);
    });
    expect((container.querySelector('.legend-add-form') as HTMLElement).hidden).toBe(true);
  });

  it('Edit reveals pencils and the add form; Done hides them again', () => {
    buildLegend(container, onToggle);
    const btn = editModeBtn();

    btn.click();
    expect(btn.textContent).toBe('✓ Done');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    container.querySelectorAll<HTMLElement>('.legend-edit-btn').forEach((el) => {
      expect(el.hidden).toBe(false);
    });
    expect((container.querySelector('.legend-add-form') as HTMLElement).hidden).toBe(false);

    btn.click();
    expect(btn.textContent).toBe('✏️ Edit');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    container.querySelectorAll<HTMLElement>('.legend-edit-btn').forEach((el) => {
      expect(el.hidden).toBe(true);
    });
    expect((container.querySelector('.legend-add-form') as HTMLElement).hidden).toBe(true);
  });

  it('Done collapses a row left mid-edit instead of leaving it stuck', () => {
    buildLegend(container, onToggle);
    editModeBtn().click();

    const row = checkboxFor('museum').closest('.legend-row') as HTMLElement;
    (row.querySelector('.legend-edit-btn') as HTMLButtonElement).click();
    expect((row.querySelector('.legend-edit-glyph') as HTMLElement).hidden).toBe(false);

    editModeBtn().click(); // Done, without saving or cancelling first

    expect((row.querySelector('.legend-swatch') as HTMLElement).hidden).toBe(false);
    expect((row.querySelector('.legend-edit-glyph') as HTMLElement).hidden).toBe(true);
    expect((row.querySelector('.legend-edit-btn') as HTMLElement).hidden).toBe(true);
  });
});

describe('add category form', () => {
  function submitAddForm(glyph: string, label: string): void {
    const form = container.querySelector('.legend-add-form') as HTMLFormElement;
    (form.querySelector('.legend-add-glyph') as HTMLInputElement).value = glyph;
    (form.querySelector('.legend-add-label') as HTMLInputElement).value = label;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  it('shows an inline error and does not call addCategory when a field is empty', async () => {
    const addCategorySpy = vi.spyOn(categoriesModule, 'addCategory');
    buildLegend(container, onToggle);
    editModeBtn().click();

    submitAddForm('', 'Coffee Shop');
    await Promise.resolve();

    expect(addCategorySpy).not.toHaveBeenCalled();
    const error = container.querySelector('.legend-add-error') as HTMLElement;
    expect(error.hidden).toBe(false);
  });

  it('adds a new row and toggles it shown on successful submit', async () => {
    vi.spyOn(categoriesModule, 'addCategory').mockResolvedValue({
      id: 'coffee-shop', label: 'Coffee Shop', glyph: '☕', color: '#3E2723',
    });
    buildLegend(container, onToggle);
    editModeBtn().click();
    const countBefore = container.querySelectorAll('.legend-checkbox').length;

    submitAddForm('☕', 'Coffee Shop');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.querySelectorAll('.legend-checkbox').length).toBe(countBefore + 1);
    expect(checkboxFor('coffee-shop').checked).toBe(true);
    expect(onToggle).toHaveBeenCalledWith('coffee-shop', true);

    const labelInput = container.querySelector('.legend-add-label') as HTMLInputElement;
    expect(labelInput.value).toBe('');
  });

  it('shows an inline error when addCategory fails', async () => {
    vi.spyOn(categoriesModule, 'addCategory').mockResolvedValue(null);
    buildLegend(container, onToggle);
    editModeBtn().click();

    submitAddForm('☕', 'Coffee Shop');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const error = container.querySelector('.legend-add-error') as HTMLElement;
    expect(error.hidden).toBe(false);
  });
});

describe('edit category', () => {
  function rowFor(category: string): HTMLElement {
    return checkboxFor(category).closest('.legend-row') as HTMLElement;
  }

  function clickEdit(category: string): void {
    (rowFor(category).querySelector('.legend-edit-btn') as HTMLButtonElement).click();
  }

  beforeEach(() => {
    buildLegend(container, onToggle);
    editModeBtn().click();
  });

  it('reveals emoji/name inputs pre-filled with the current values, hiding the swatch and label', () => {
    clickEdit('museum');

    const row = rowFor('museum');
    const museum = getCategories().find((c) => c.id === 'museum')!;
    expect((row.querySelector('.legend-swatch') as HTMLElement).hidden).toBe(true);
    expect((row.querySelector('.legend-label') as HTMLElement).hidden).toBe(true);
    expect((row.querySelector('.legend-edit-glyph') as HTMLInputElement).value).toBe(museum.glyph);
    expect((row.querySelector('.legend-edit-label') as HTMLInputElement).value).toBe(museum.label);
  });

  it('cancel discards changes and reverts to the swatch/label view', () => {
    clickEdit('museum');
    const row = rowFor('museum');

    (row.querySelector('.legend-edit-label') as HTMLInputElement).value = 'Something Else';
    (row.querySelector('.legend-edit-cancel') as HTMLButtonElement).click();

    expect((row.querySelector('.legend-swatch') as HTMLElement).hidden).toBe(false);
    expect((row.querySelector('.legend-label') as HTMLElement).textContent).toBe('Museum');
  });

  it('save calls updateCategory and applies the result to the swatch and label', async () => {
    vi.spyOn(categoriesModule, 'updateCategory').mockResolvedValue({
      id: 'museum', label: 'Art Museum', glyph: '🖼', color: '#9C27B0',
    });
    clickEdit('museum');
    const row = rowFor('museum');

    (row.querySelector('.legend-edit-glyph') as HTMLInputElement).value = '🖼';
    (row.querySelector('.legend-edit-label') as HTMLInputElement).value = 'Art Museum';
    (row.querySelector('.legend-edit-save') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(categoriesModule.updateCategory).toHaveBeenCalledWith('museum', { label: 'Art Museum', glyph: '🖼' });
    expect((row.querySelector('.legend-label') as HTMLElement).textContent).toBe('Art Museum');
    expect((row.querySelector('.legend-swatch') as HTMLElement).textContent).toBe('🖼');
    expect((row.querySelector('.legend-swatch') as HTMLElement).hidden).toBe(false);
  });

  it('does not call updateCategory when nothing changed', () => {
    const updateSpy = vi.spyOn(categoriesModule, 'updateCategory');
    clickEdit('museum');
    const row = rowFor('museum');

    (row.querySelector('.legend-edit-save') as HTMLButtonElement).click();

    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe('glyph picker', () => {
  function addFormPickerBtn(): HTMLButtonElement {
    return container.querySelector('.legend-add-glyph + .legend-glyph-picker-btn') as HTMLButtonElement;
  }

  it('does not open on focus/click of the glyph input itself (would double up with a mobile keyboard)', () => {
    buildLegend(container, onToggle);
    editModeBtn().click();

    const glyphInput = container.querySelector('.legend-add-glyph') as HTMLInputElement;
    glyphInput.dispatchEvent(new Event('focus'));
    glyphInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const picker = document.querySelector('.legend-glyph-picker') as HTMLElement | null;
    expect(picker === null || picker.hidden).toBe(true);
  });

  it('opens on clicking the picker button, and selecting an option fills in the glyph input', () => {
    buildLegend(container, onToggle);
    editModeBtn().click();

    const glyphInput = container.querySelector('.legend-add-glyph') as HTMLInputElement;
    addFormPickerBtn().click();

    const picker = document.querySelector('.legend-glyph-picker') as HTMLElement;
    expect(picker).not.toBeNull();
    expect(picker.hidden).toBe(false);

    const firstOption = picker.querySelector('.legend-glyph-option') as HTMLButtonElement;
    firstOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(glyphInput.value).toBe(firstOption.textContent);
    expect(picker.hidden).toBe(true);
  });

  it('closes if the glyph input is focused directly, without changing its value', () => {
    buildLegend(container, onToggle);
    editModeBtn().click();

    const glyphInput = container.querySelector('.legend-add-glyph') as HTMLInputElement;
    addFormPickerBtn().click();
    const picker = document.querySelector('.legend-glyph-picker') as HTMLElement;
    expect(picker.hidden).toBe(false);

    glyphInput.value = 'x'; // simulates the user starting to type/paste
    glyphInput.dispatchEvent(new Event('focus'));

    expect(picker.hidden).toBe(true);
    expect(glyphInput.value).toBe('x');
  });

  it('closes without changing the value when clicking outside', () => {
    buildLegend(container, onToggle);
    editModeBtn().click();

    const glyphInput = container.querySelector('.legend-add-glyph') as HTMLInputElement;
    addFormPickerBtn().click();
    const picker = document.querySelector('.legend-glyph-picker') as HTMLElement;
    expect(picker.hidden).toBe(false);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(picker.hidden).toBe(true);
    expect(glyphInput.value).toBe('');
  });

  it('closes on Escape', () => {
    buildLegend(container, onToggle);
    editModeBtn().click();

    addFormPickerBtn().click();
    const picker = document.querySelector('.legend-glyph-picker') as HTMLElement;
    expect(picker.hidden).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(picker.hidden).toBe(true);
  });

  it('clicking the same picker button again toggles it closed', () => {
    buildLegend(container, onToggle);
    editModeBtn().click();

    const btn = addFormPickerBtn();
    btn.click();
    const picker = document.querySelector('.legend-glyph-picker') as HTMLElement;
    expect(picker.hidden).toBe(false);

    btn.click();
    expect(picker.hidden).toBe(true);
  });

  it('clicking a different field\'s picker button switches instead of toggling closed', () => {
    buildLegend(container, onToggle);
    editModeBtn().click();

    addFormPickerBtn().click();
    const picker = document.querySelector('.legend-glyph-picker') as HTMLElement;
    expect(picker.hidden).toBe(false);

    const landformRow = checkboxFor('landform').closest('.legend-row') as HTMLElement;
    (landformRow.querySelector('.legend-edit-btn') as HTMLButtonElement).click();
    (landformRow.querySelector('.legend-glyph-picker-btn') as HTMLButtonElement).click();

    expect(picker.hidden).toBe(false);
  });

  it('reuses one shared picker element across different glyph inputs', () => {
    buildLegend(container, onToggle);
    editModeBtn().click();

    addFormPickerBtn().click();
    expect(document.querySelectorAll('.legend-glyph-picker').length).toBe(1);

    const museumRow = checkboxFor('museum').closest('.legend-row') as HTMLElement;
    (museumRow.querySelector('.legend-edit-btn') as HTMLButtonElement).click();
    (museumRow.querySelector('.legend-glyph-picker-btn') as HTMLButtonElement).click();

    expect(document.querySelectorAll('.legend-glyph-picker').length).toBe(1);
  });

  function optionGlyphs(): string[] {
    return Array.from(document.querySelectorAll('.legend-glyph-option')).map((el) => el.textContent!);
  }

  // Uses 'landform' rather than 'museum' here — an earlier test in this file
  // saves a mocked update for 'museum' that mutates the shared categories
  // module state (rows hold the same object references as its array) for
  // the rest of the run, so 'museum' can't be relied on to still have its
  // original glyph by this point.
  it('excludes a glyph already used by another category, even across a variation-selector mismatch', () => {
    buildLegend(container, onToggle);
    editModeBtn().click();
    addFormPickerBtn().click();

    // EMOJI_OPTIONS has '⛰️' (with the FE0F variation selector); landform's
    // own stored glyph is the plain '⛰' — these should still count as the
    // same glyph and both be excluded from a brand-new category's picker.
    expect(optionGlyphs()).not.toContain('⛰️');
    expect(optionGlyphs()).not.toContain('⛪'); // worship's glyph, exact match
  });

  it("keeps a category's own current glyph selectable when editing that category", () => {
    buildLegend(container, onToggle);
    editModeBtn().click();

    const landformRow = checkboxFor('landform').closest('.legend-row') as HTMLElement;
    (landformRow.querySelector('.legend-edit-btn') as HTMLButtonElement).click();
    (landformRow.querySelector('.legend-glyph-picker-btn') as HTMLButtonElement).click();

    expect(optionGlyphs()).toContain('⛰️'); // landform's own glyph — not filtered out for itself
    expect(optionGlyphs()).not.toContain('⛪'); // still excludes other categories' glyphs
  });
});
