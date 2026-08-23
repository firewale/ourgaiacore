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

  it('reveals emoji/name inputs pre-filled with the current values, hiding the swatch and label', () => {
    buildLegend(container, onToggle);
    clickEdit('museum');

    const row = rowFor('museum');
    const museum = getCategories().find((c) => c.id === 'museum')!;
    expect((row.querySelector('.legend-swatch') as HTMLElement).hidden).toBe(true);
    expect((row.querySelector('.legend-label') as HTMLElement).hidden).toBe(true);
    expect((row.querySelector('.legend-edit-glyph') as HTMLInputElement).value).toBe(museum.glyph);
    expect((row.querySelector('.legend-edit-label') as HTMLInputElement).value).toBe(museum.label);
  });

  it('cancel discards changes and reverts to the swatch/label view', () => {
    buildLegend(container, onToggle);
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
    buildLegend(container, onToggle);
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
    buildLegend(container, onToggle);
    clickEdit('museum');
    const row = rowFor('museum');

    (row.querySelector('.legend-edit-save') as HTMLButtonElement).click();

    expect(updateSpy).not.toHaveBeenCalled();
  });
});
