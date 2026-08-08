import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildLegend, collapseLegend } from '../legend.js';
import { CATEGORY_STYLE } from '../marker.js';

let container: HTMLElement;
let onToggle: ReturnType<typeof vi.fn>;

beforeEach(() => {
  container = document.createElement('div');
  onToggle = vi.fn();
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
    const expectedCount = Object.keys(CATEGORY_STYLE).length - 1;
    expect(rows.length).toBe(expectedCount);
    expect(container.querySelector('.legend-checkbox[data-category="default"]')).toBeNull();
  });

  it('formats category keys into title-cased labels', () => {
    buildLegend(container, onToggle);
    const labels = Array.from(container.querySelectorAll('.legend-label')).map((el) => el.textContent);
    expect(labels).toContain('Ghost Town');
    expect(labels).toContain('Museum');
  });

  it('checkboxes start checked and swatches use the category color and glyph', () => {
    buildLegend(container, onToggle);
    const museumCheckbox = checkboxFor('museum');
    expect(museumCheckbox.checked).toBe(true);

    const swatch = museumCheckbox.parentElement!.querySelector('.legend-swatch') as HTMLElement;
    expect(swatch.style.backgroundColor).toBe(hexToRgb(CATEGORY_STYLE.museum.color));
    expect(swatch.textContent).toBe(CATEGORY_STYLE.museum.glyph);
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
