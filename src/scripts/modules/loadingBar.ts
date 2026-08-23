// Reference-counted so overlapping fetches (a pan starting before the
// previous one's stream has finished) keep the bar visible until the last
// one completes, rather than one finishing early and hiding it prematurely.
let activeCount = 0;

const SVG_NS = 'http://www.w3.org/2000/svg';

// Globe artwork is a 90s-throbber-style pixel sprite: a low-resolution
// equirectangular world map that scrolls horizontally behind a circular mask
// (see main.css for the stepped scroll animation). GLOBE_SIZE is the disc in
// pixel units; the map spans 360 degrees across GLOBE_SIZE * 2 columns, so the
// visible face shows 180 degrees at a time — the correct proportion for a
// sphere.
const GLOBE_SIZE = 16;
const MAP_WIDTH = GLOBE_SIZE * 2;

// Colors track the app's own map palette (CATEGORY_STYLE in marker.ts):
// waterway blue for ocean, park green for land.
const OCEAN = '#0277bd';
const LAND = '#388e3c';
const ICE = '#e8f4f8';

// Equirectangular world map, one character per pixel: '.' ocean, '#' land,
// '*' polar ice. Row 0 is 90N, row 15 is 90S; column 0 is 180W (the
// antimeridian). The seam therefore falls in the empty mid-Pacific, so the
// map tiles horizontally without visibly cutting a continent — the polar rows
// are uniform and Antarctica runs continuously across the wrap.
const WORLD_MAP = [
  '********************************', // 90-79N  arctic ice
  '....................########....', // 79-67N  Arctic Ocean, Siberian coast
  '..######.####..###############..', // 67-56N  N. Canada, Scandinavia, Siberia
  '..######..###..####.##########..', // 56-45N  Canada/US, Europe, Asia
  '...#####.......###..##########..', // 45-34N  US, Mediterranean, Asia
  '....###........####..####.####..', // 34-22N  Mexico, Sahara, Arabia, China
  '.....##.......#####...##..###...', // 22-11N  C. America, Africa, India, SE Asia
  '......###.....#####....#...##...', // 11N-0   N. S.America, Africa, Indonesia
  '.......###....#####.......###...', // 0-11S   S.America, Africa, Indonesia
  '.......###....####........#.....', // 11-22S  S.America, Africa
  '.......###.....###.......####...', // 22-34S  S.America, S. Africa, Australia
  '........##.....##........###....', // 34-45S  S.America tip, Australia/NZ
  '........#.......................', // 45-56S  S.America tip
  '................................', // 56-67S  southern ocean
  '...***.........***........**....', // 67-79S  Antarctic coast fragments
  '********************************', // 79-90S  antarctic ice
];

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  return el;
}

// Emits one rect per horizontal run of matching pixels rather than one per
// pixel — keeps the generated DOM to a few dozen nodes instead of ~500.
function appendRuns(
  parent: SVGElement,
  rows: string[],
  matches: (ch: string) => boolean,
  fill: string,
  xOffset = 0,
  opacity?: number
): void {
  rows.forEach((row, y) => {
    let runStart = -1;
    for (let x = 0; x <= row.length; x++) {
      const isMatch = x < row.length && matches(row[x]);
      if (isMatch && runStart === -1) {
        runStart = x;
      } else if (!isMatch && runStart !== -1) {
        const attrs: Record<string, string | number> = {
          x: runStart + xOffset,
          y,
          width: x - runStart,
          height: 1,
          fill,
        };
        if (opacity !== undefined) attrs['fill-opacity'] = opacity;
        parent.appendChild(svgEl('rect', attrs));
        runStart = -1;
      }
    }
  });
}

function isInsideDisc(x: number, y: number): boolean {
  const r = GLOBE_SIZE / 2;
  const dx = x + 0.5 - r;
  const dy = y + 0.5 - r;
  return dx * dx + dy * dy <= r * r;
}

// The circular mask is computed rather than hand-drawn so it stays perfectly
// symmetric, and is built from whole pixel units so the globe's rim steps like
// the rest of the sprite instead of being smoothly anti-aliased.
function buildDiscClip(id: string): SVGElement {
  const clip = svgEl('clipPath', { id, clipPathUnits: 'userSpaceOnUse' });
  const discRows: string[] = [];
  for (let y = 0; y < GLOBE_SIZE; y++) {
    let row = '';
    for (let x = 0; x < GLOBE_SIZE; x++) row += isInsideDisc(x, y) ? '#' : '.';
    discRows.push(row);
  }
  appendRuns(clip, discRows, (ch) => ch === '#', '#000');
  return clip;
}

// Lighting is quantized into a few flat bands (rather than a smooth gradient)
// to stay within the limited-palette pixel look, and stays fixed while the map
// scrolls beneath it — that contrast is what reads as a lit sphere rotating
// rather than a picture sliding past.
function buildShading(): SVGElement {
  const group = svgEl('g', {});
  const lightX = 5;
  const lightY = 4.5;

  // Thresholds are tuned so the lit face stays dominant (~68% of the disc) and
  // the shadow hugs the far limb — heavier banding reads as a sphere but
  // swallows the continents at this resolution.
  const bands: Array<{ min: number; max: number; fill: string; opacity: number }> = [
    { min: 0, max: 1.8, fill: '#ffffff', opacity: 0.22 },      // specular highlight
    { min: 9, max: 11.5, fill: '#000000', opacity: 0.14 },     // terminator
    { min: 11.5, max: Infinity, fill: '#000000', opacity: 0.3 }, // far limb
  ];

  for (const band of bands) {
    const rows: string[] = [];
    for (let y = 0; y < GLOBE_SIZE; y++) {
      let row = '';
      for (let x = 0; x < GLOBE_SIZE; x++) {
        const dx = x + 0.5 - lightX;
        const dy = y + 0.5 - lightY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        row += dist >= band.min && dist < band.max ? '#' : '.';
      }
      rows.push(row);
    }
    appendRuns(group, rows, (ch) => ch === '#', band.fill, 0, band.opacity);
  }
  return group;
}

function buildGlobe(): SVGSVGElement {
  const svg = svgEl('svg', {
    class: 'loading-bar__svg',
    viewBox: `0 0 ${GLOBE_SIZE} ${GLOBE_SIZE}`,
    'shape-rendering': 'crispEdges',
    'aria-hidden': 'true',
  });

  const clipId = 'og-globe-disc';
  const defs = svgEl('defs', {});
  defs.appendChild(buildDiscClip(clipId));
  svg.appendChild(defs);

  const clipped = svgEl('g', { 'clip-path': `url(#${clipId})` });

  // Two copies of the map side by side so scrolling one full map width loops
  // back to an identical frame with no visible jump.
  const map = svgEl('g', { class: 'loading-bar__map' });
  map.appendChild(svgEl('rect', { x: 0, y: 0, width: MAP_WIDTH * 2, height: GLOBE_SIZE, fill: OCEAN }));
  for (const xOffset of [0, MAP_WIDTH]) {
    appendRuns(map, WORLD_MAP, (ch) => ch === '#', LAND, xOffset);
    appendRuns(map, WORLD_MAP, (ch) => ch === '*', ICE, xOffset);
  }
  clipped.appendChild(map);

  clipped.appendChild(buildShading());
  svg.appendChild(clipped);
  return svg;
}

function getElement(): HTMLElement {
  return document.getElementById('loading-bar') as HTMLElement;
}

// Built lazily and only when missing: the markup is generated rather than
// authored in index.html, and tests reset document.body between cases, so it
// has to be able to rebuild itself.
function ensureGlobe(el: HTMLElement): void {
  if (!el.firstElementChild) el.appendChild(buildGlobe());
}

export function beginLoading(): void {
  activeCount++;
  const el = getElement();
  ensureGlobe(el);
  el.removeAttribute('hidden');
}

export function endLoading(): void {
  activeCount = Math.max(0, activeCount - 1);
  if (activeCount === 0) {
    getElement().setAttribute('hidden', '');
  }
}

export function _resetLoadingBarForTests(): void {
  activeCount = 0;
}
