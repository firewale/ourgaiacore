// @vitest-environment node
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Response } from 'express';
import { mapEventsRouter } from '../mapEvents.js';
import { isMapOpen, listMaps, publish, subscribe, _resetMapEventsForTests } from '../../lib/mapEvents.js';

const VIEW = { lat: 35, lng: 135, zoom: 10, hiddenCategories: ['park'] };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/', mapEventsRouter);
  return app;
}

beforeEach(() => {
  _resetMapEventsForTests();
});

interface Stream {
  session: Promise<string>;
  ended: Promise<void>;
  text: () => string;
  close: () => void;
}

// Opens the SSE stream on a live server; session resolves with the map id from
// its first event, ended when the server ends the stream.
function openStream(port: number, mapId?: string): Stream {
  let body = '';
  let req!: http.ClientRequest;
  let resolveSession!: (id: string) => void;
  const session = new Promise<string>((r) => (resolveSession = r));
  const ended = new Promise<void>((resolveEnded) => {
    req = http.get({ port, path: mapId ? `/?mapId=${mapId}` : '/' }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        body += chunk;
        const match = /event: session\ndata: (.*)\n\n/.exec(body);
        if (match) resolveSession((JSON.parse(match[1]) as { mapId: string }).mapId);
      });
      res.on('end', () => resolveEnded());
    });
    req.on('error', () => resolveEnded());
  });
  return { session, ended, text: () => body, close: () => req.destroy() };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !condition(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(condition()).toBe(true);
}

describe('GET /api/map-events', () => {
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    server = makeApp().listen(0);
    await new Promise<void>((r) => server.once('listening', () => r()));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('lets a reconnect with the same id take it over and ends the old stream', async () => {
    const stale = openStream(port);
    const mapId = await stale.session;

    const current = openStream(port, mapId);
    expect(await current.session).toBe(mapId);
    await stale.ended;
    await new Promise((r) => setTimeout(r, 20)); // let the stale stream's close handler run

    expect(isMapOpen(mapId)).toBe(true);
    expect(publish(mapId, { type: 'filter', mode: 'all', categories: [] })).toBe(true);
    await waitFor(() => current.text().includes('event: filter'));
    expect(stale.text()).not.toContain('event: filter');

    current.close();
    await waitFor(() => !isMapOpen(mapId));
  });
});

describe('PUT /api/map-events/:mapId/view', () => {
  it('stores the view of an open map for list_maps', async () => {
    const { mapId } = subscribe({ write: vi.fn() } as unknown as Response);

    const res = await request(makeApp()).put(`/${mapId}/view`).send(VIEW);

    expect(res.status).toBe(204);
    expect(listMaps()[0].view).toEqual(VIEW);
  });

  it('returns 404 for an id no open map has', async () => {
    const res = await request(makeApp()).put('/zzzzzz/view').send(VIEW);
    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed view', async () => {
    const { mapId } = subscribe({ write: vi.fn() } as unknown as Response);

    const res = await request(makeApp()).put(`/${mapId}/view`).send({ lat: 'north', lng: 135, zoom: 10 });

    expect(res.status).toBe(400);
    expect(listMaps()[0].view).toBeUndefined();
  });
});
