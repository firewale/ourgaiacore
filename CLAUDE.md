# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install            # install dependencies
npm run dev            # start dev servers (Vite at :5173 for frontend, Express at :8080)
npm run build          # compile TypeScript server + bundle frontend with Vite
npm start              # run production build (requires npm run build first)
npm test               # run Vitest unit tests
npm run test:coverage  # run tests with coverage report
npm run lint           # TypeScript type-check only (no emit)
```

**Docker:**
```bash
docker build -t ourgaia .
docker run -p 8080:8080 -p 8443:8443 ourgaia
```

## Environment Variables

Copy `.env.example` to `.env` before running locally. Required variables:
- `VITE_MAP_STYLE_URL` — MapLibre style URL embedded into the frontend bundle by Vite at build time (defaults to OpenFreeMap's `liberty` style if unset — no API key required)
- `PORT` — HTTP port (default: 8080)
- `HTTPS_PORT` — HTTPS port (default: 8443, only used if `server.key` + `server.crt` exist)
- `REDIS_URL` — Redis connection string (default: `redis://localhost:6379`). If Redis is unavailable, the server falls back to direct Wikipedia API calls with no caching.

## Architecture

This is a single-page application (SPA) with a thin Express backend serving static files.

**Backend (`src/server.ts`):** Express with helmet + morgan. Serves `public/` as static files. Starts HTTP on `PORT`. If `server.key` and `server.crt` exist in the project root, also starts HTTPS on `HTTPS_PORT`. Compiles to `dist/server.js` via `tsconfig.server.json`.

**Frontend build pipeline:**
- Entry: `src/scripts/main.ts` (TypeScript ES modules)
- Output: `public/js/main.js` (IIFE bundle via Vite)
- Vite config: `vite.config.ts`; TypeScript config: `tsconfig.frontend.json`

**Frontend module structure (`src/scripts/modules/`):**
- `map.ts` — MapLibre GL JS initialization, marker plotting, map idle event handling, custom controls
- `wikipedia.ts` — Calls `/api/wikipedia` on the Express server; returns `WikiArticle` records. Has an in-memory cache keyed by rounded lat/lng as a first layer.
- `geolocation.ts` — Browser geolocation and geocoder wrappers returning Promises
- `marker.ts` — MapLibre marker/popup creation helpers
- `search.ts` — Search control UI wired into the map's custom control overlay
- `coordinate.ts` — Shared `{ lat, lng }` coordinate type used across modules

**Data flow:** `main.ts` calls `geolocation.getCurrentPosition()` → `map.initialize()` renders the MapLibre map → `wikipedia.getWikipediaData()` fetches nearby Wikipedia articles → `map.plotLandmarks()` places markers. On map idle (pan/zoom), Wikipedia data is re-fetched for the new center.

**Tests:** `src/scripts/modules/__tests__/` — Vitest with jsdom environment. `maplibre-gl` is mocked with `vi.mock`. Run with `npm test`.
