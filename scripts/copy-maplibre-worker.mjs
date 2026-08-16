// MapLibre's tile-parsing worker (maplibre-gl-worker.mjs) imports a sibling
// chunk (maplibre-gl-shared.mjs) via a relative URL computed at runtime from
// its own location. Bundlers don't reliably preserve that pairing, so we copy
// both files verbatim into public/ and point maplibregl.setWorkerUrl() at the
// copy (see src/scripts/main.ts) instead of relying on bundler auto-detection.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '../node_modules/maplibre-gl/dist');
const destDir = join(__dirname, '../public/maplibre');

mkdirSync(destDir, { recursive: true });

for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}
