import { Router } from 'express';
import { subscribe, updateView, type MapView } from '../lib/mapEvents.js';

export const mapEventsRouter = Router();

const HEARTBEAT_MS = 25_000; // keeps proxies from closing an idle stream

// Server-Sent Events stream the browser listens on, so MCP tool calls (which
// arrive at the server) can move the map (which lives in the browser). The
// first event tells the tab its map id; `?mapId=` asks to keep a previous one.
mapEventsRouter.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const requestedId = typeof req.query.mapId === 'string' ? req.query.mapId : undefined;
  const { mapId, unsubscribe } = subscribe(res, requestedId);
  res.write(`event: session\ndata: ${JSON.stringify({ mapId })}\n\n`);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

  // The response's close tracks the stream itself, including when a reconnect
  // with the same id takes it over and ends it.
  res.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

function isMapView(value: unknown): value is MapView {
  if (typeof value !== 'object' || value === null) return false;
  const { lat, lng, zoom, hiddenCategories } = value as Record<string, unknown>;
  return (
    typeof lat === 'number' && Number.isFinite(lat) &&
    typeof lng === 'number' && Number.isFinite(lng) &&
    typeof zoom === 'number' && Number.isFinite(zoom) &&
    Array.isArray(hiddenCategories) &&
    hiddenCategories.every((c) => typeof c === 'string')
  );
}

// A tab reports its center, zoom and filter here so list_maps can describe it.
mapEventsRouter.put('/:mapId/view', (req, res) => {
  if (!isMapView(req.body)) {
    res.status(400).json({ error: 'body must have numeric lat, lng, zoom and a hiddenCategories string array' });
    return;
  }
  const { lat, lng, zoom, hiddenCategories } = req.body;
  if (!updateView(req.params.mapId, { lat, lng, zoom, hiddenCategories })) {
    res.status(404).json({ error: 'no open map has that id' });
    return;
  }
  res.status(204).end();
});
