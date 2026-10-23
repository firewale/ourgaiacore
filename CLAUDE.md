# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install            # install dependencies
npm run dev            # start dev servers (Vite at :5173 for frontend, Express at :8080)
npm run services:up    # start Redis + Postgres (docker compose up -d)
npm run services:down  # stop Redis + Postgres (docker compose down)
npm run build          # compile TypeScript server + bundle frontend with Vite
npm start              # run production build (requires npm run build first)
npm test               # run Vitest unit tests
npm run test:coverage  # run tests with coverage report
npm run lint           # TypeScript type-check of frontend, server and verify scripts (no emit)
npm run verify         # check the running stack: health, server freshness, MCP contract, payload size, DB invariants
npm run verify:chat    # chat-model evals (slow): which tool the model picks per prompt; flags: --model, --repeat N, --no-gate
```

`npm run dev` runs the server with plain `tsx` (no watch): Vite hot-reloads frontend changes, but **changes under `src/server.ts`, `src/routes`, `src/lib`, `src/mcp`, or `.env` need a restart** of `npm run dev`. `npm run verify`'s `server-fresh` check flags a stale server.

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
- `DATABASE_URL` — Postgres connection string (default: `postgres://ourgaia:ourgaia@localhost:5432/ourgaia`). Run locally via `npm run services:up` (starts both Redis and Postgres through `compose.yaml`). If Postgres is unreachable, the server falls back to the built-in default category rules with no editability.
- `OLLAMA_URL` (default `http://localhost:11434`), `OLLAMA_MODEL` (chat model, default `llama3.2`), `OLLAMA_EMBED_MODEL` (RAG embeddings, default `nomic-embed-text`). Small models like `llama3.2` call a tool on almost every turn when tools are offered; `gemma4:31b` chooses tools reliably. Check a model with `npm run verify:chat -- --model <name> --no-gate`.
- `VERIFY_BASE_URL` — server the verify scripts target (default `http://localhost:8080`).

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
- `categories.ts` — Calls `/api/categories`; returns `CategoryStyle` records (id, label, glyph, color). Ships a built-in fallback list so markers/legend render correctly before the fetch resolves.
- `legend.ts` — Builds the category-toggle legend panel, including the "add category" form (emoji + name) that calls `categories.addCategory()`.
- `geolocation.ts` — Browser geolocation and geocoder wrappers returning Promises
- `marker.ts` — MapLibre marker/popup creation helpers; looks up marker color/glyph via `categories.getCategoryStyle()`
- `search.ts` — Search control UI wired into the map's custom control overlay
- `coordinate.ts` — Shared `{ lat, lng }` coordinate type used across modules
- `chat.ts` — Chat window UI (welcome message with example prompts) and streaming client for `/api/chat`; sends visible landmarks as RAG candidates, trimmed by `candidateExcerpt.ts` to stay under the server's 1 MB JSON body limit
- `mapContext.ts` — Holds the currently plotted articles for the chat's RAG candidates
- `mapEvents.ts` — Subscribes to `GET /api/map-events` (see Map events below)

**Category system (`src/lib/`):** `ArticleCategory` (`src/lib/articleCategory.ts`) is an open-ended string id, not a fixed enum — the valid set is user-extensible at runtime via three Postgres tables, each with a built-in-defaults fallback if Postgres is unreachable:
- `categories` (`src/lib/categories.ts`, seeded from `src/lib/defaultCategories.ts`) — the addable category list: id, label, glyph, color. `POST /api/categories` (`src/routes/categories.ts`) adds a new one — slugifies the label into an id and auto-assigns the first palette color (built-in category colors, then `EXTRA_COLORS`) no existing category uses. Label and glyph are editable via `PATCH /api/categories/:id`; color isn't (change it in the table directly). `GET /api/categories` serves the list; the frontend's `categories.ts` mirrors this table's shape with its own built-in fallback.
- `category_rules` (`src/lib/categoryRules.ts`, seeded from `src/lib/defaultCategoryRules.ts`) — keyword → category id rules used to auto-classify a Wikipedia article from its raw categories, then its title (first match wins).
- `article_category_overrides` (`src/lib/articleCategoryOverrides.ts`) — per-article manual overrides (set via the marker popup's category editor, `PATCH /api/wikipedia/:pageId/category`), applied on top of the classifier result on every `GET /api/wikipedia` response regardless of cache state. A `source` column (`manual` / `agent`) records who set each one; agent writes never replace a manual override.
- `uncategorized_articles` (`src/lib/uncategorizedArticles.ts`) — work queue of articles the classifier last resolved to `default` (the "?" marker), recorded by `GET /api/wikipedia` whenever it classifies articles, with their extract and raw Wikipedia categories. Rows are removed when a later classification succeeds; articles with an override are filtered out at read time.

`src/server.ts` calls `initCategories()` / `initCategoryRules()` / `initArticleCategoryOverrides()` / `initUncategorizedArticles()` on boot (fire-and-forget — routes classify with built-in defaults in the meantime).

**MCP server (`src/mcp/`, `src/routes/mcp.ts`):** Exposes map tools to MCP clients over stateless Streamable HTTP at versioned URLs — `/mcp/v1` and `/mcp/v2`. Each version is its own tool contract (`src/mcp/tools/v1.ts`, `v2.ts`) adapting a shared, version-independent core (`src/mcp/navigation.ts`); `createMcpServer(version)` in `src/mcp/createServer.ts` wires them up. Versioning policy: additive changes (new optional params, new tools) go into the current version; breaking changes (renamed/removed params or tools, changed output shape) go into a new version while the old one keeps working. Map view tools take a required `mapId` and only ever change that one map (see Map events). `go_to_place` — v1 takes `{ mapId, place }` (deprecated), v2 takes `{ mapId, query, zoom? }` and returns `structuredContent`. v2 also has `filter_map` (`{ mapId, mode: only|show|hide|all, categories? }`, core in `src/mcp/mapFilter.ts`), `list_maps` (open maps with their last reported center, zoom and hidden categories, for the user to choose from) and `list_uncategorized_articles` / `set_article_category` (core in `src/mcp/categorization.ts`) for an agent to work through the uncategorized queue. Connect Claude Code with `claude mcp add --transport http ourgaia http://localhost:8080/mcp/v2`.

**Map events (`src/lib/mapEvents.ts`, `src/routes/mapEvents.ts`):** MCP tools run on the server but the map lives in the browser, so tools publish commands to a Server-Sent Events stream at `GET /api/map-events`. Each tab's stream gets a short map id (first `session` event; `?mapId=` asks to keep the previous one, stored in `sessionStorage` so a reload keeps it), shown in the map's bottom-right badge for the user to hand to an MCP client. Events only go to the map id a tool names — never to every tab. The frontend's `mapEvents.ts` subscribes and calls `map.navigateTo()` (`navigate` events) or `map.applyCategoryFilter()` (`filter` events, which also syncs the legend checkboxes), and reports its view via `PUT /api/map-events/:mapId/view` for `list_maps`.

**In-app chat tools (`src/routes/chat.ts`):** The Ollama chat is offered the `/mcp/v2` map view tools, `go_to_place` and `filter_map` (`CHAT_TOOLS` allowlist — not the categorization tools) through an in-process MCP client (`InMemoryTransport`), so the chat and external MCP clients share one tool definition. The chat request carries its tab's `mapId`, which `runToolCalls` fills in (it's stripped from the schema the model sees), so chat tools only act on that tab; without a `mapId` no tools are offered. Tool calls are executed and fed back to Ollama for up to 3 rounds per turn. Tools are only offered when the latest user message matches `MAP_INTENT` (go/show/hide/only/filter/…), and every request starts with `BASE_SYSTEM_PROMPT` describing when to use them — both guard against small models calling tools for unrelated questions.

**Data flow:** `main.ts` awaits `categories.loadCategories()` (fast, same-origin), then calls `geolocation.getCurrentPosition()` → `map.initialize()` renders the MapLibre map → `wikipedia.getWikipediaData()` fetches nearby Wikipedia articles → `map.plotLandmarks()` places markers. On map idle (pan/zoom), Wikipedia data is re-fetched for the new center.

**Tests:** Vitest, run with `npm test`. Frontend tests in `src/scripts/modules/__tests__/` use jsdom with `maplibre-gl` mocked via `vi.mock`; server tests in `src/routes/__tests__/`, `src/lib/__tests__/` and `src/mcp/__tests__/` start with `// @vitest-environment node` and mock Redis/Postgres/`fetch`.

**Verification (`scripts/verify/`, `.claude/agents/verifier.md`):** unit tests mock Redis/Postgres/Ollama/Wikipedia; `npm run verify` checks the running server instead (via `GET /api/health`, which reports dependency status and the process `startedAt` used to detect a stale server), and `npm run verify:chat` runs `chat-evals.json` against the real model using the chat route's own request builders. All checks are side-effect free for open map tabs and data. The `verifier` agent runs these plus a browser check and reports without fixing anything.
