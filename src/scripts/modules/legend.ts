import { CATEGORY_STYLE } from './marker.js';

function formatLabel(key: string): string {
  return key
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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

  for (const [key, style] of Object.entries(CATEGORY_STYLE)) {
    if (key === 'default') continue;

    const row = document.createElement('label');
    row.className = 'legend-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.className = 'legend-checkbox';
    checkbox.dataset.category = key;
    checkbox.addEventListener('change', () => onToggle(key, checkbox.checked));
    checkboxes.push(checkbox);

    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = style.color;
    swatch.textContent = style.glyph;

    const label = document.createElement('span');
    label.className = 'legend-label';
    label.textContent = formatLabel(key);

    row.appendChild(checkbox);
    row.appendChild(swatch);
    row.appendChild(label);
    panel.appendChild(row);
  }

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
