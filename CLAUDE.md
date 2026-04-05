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
docker build -t ourgaia --build-arg VITE_GOOGLE_MAPS_API_KEY=<key> .
docker run -p 8080:8080 -p 8443:8443 ourgaia
```

## Environment Variables

Copy `.env.example` to `.env` before running locally. Required variables:
- `VITE_GOOGLE_MAPS_API_KEY` — embedded into the frontend bundle by Vite at build time
- `PORT` — HTTP port (default: 8080)
- `HTTPS_PORT` — HTTPS port (default: 8443, only used if `server.key` + `server.crt` exist)

## Architecture

This is a single-page application (SPA) with a thin Express backend serving static files.

**Backend (`src/server.ts`):** Express with helmet + morgan. Serves `public/` as static files. Starts HTTP on `PORT`. If `server.key` and `server.crt` exist in the project root, also starts HTTPS on `HTTPS_PORT`. Compiles to `dist/server.js` via `tsconfig.server.json`.

**Frontend build pipeline:**
- Entry: `src/scripts/main.ts` (TypeScript ES modules)
- Output: `public/js/main.js` (IIFE bundle via Vite)
- Vite config: `vite.config.ts`; TypeScript config: `tsconfig.frontend.json`

**Frontend module structure (`src/scripts/modules/`):**
- `map.ts` — Google Maps initialization, marker plotting, map idle event handling, custom controls
- `wikipedia.ts` — Wikipedia geosearch + extract API calls via native `fetch`; returns `WikiArticle` records
- `geolocation.ts` — Browser geolocation and geocoder wrappers returning Promises
- `marker.ts` — Google Maps marker/InfoWindow creation helpers
- `search.ts` — Search control UI wired into the Google Maps control panel

**Data flow:** `main.ts` loads the Google Maps script with `&callback=initMap`. When Maps is ready, `initMap` calls `geolocation.getCurrentPosition()` → `map.initialize()` renders the map → `wikipedia.getWikipediaData()` fetches nearby Wikipedia articles → `map.plotLandmarks()` places markers. On map idle (pan/zoom), Wikipedia data is re-fetched for the new center.

**Tests:** `src/scripts/modules/__tests__/` — Vitest with jsdom environment. Google Maps globals are mocked with `vi.stubGlobal`. Run with `npm test`.
