// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import {
  isMapOpen,
  listMaps,
  MAP_ID_PATTERN,
  publish,
  subscribe,
  updateView,
  _resetMapEventsForTests,
} from '../mapEvents.js';

const EVENT = { type: 'navigate' as const, lat: 1, lng: 2, zoom: 14, displayName: 'Somewhere' };
const VIEW = { lat: 1, lng: 2, zoom: 12, hiddenCategories: ['park'] };

function fakeResponse() {
  const res = {
    write: vi.fn(),
    writableEnded: false,
    end: vi.fn(() => {
      res.writableEnded = true;
    }),
  };
  return res as unknown as Response & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  _resetMapEventsForTests();
});

describe('mapEvents', () => {
  it('gives each subscriber a short, unambiguous map id', () => {
    const a = subscribe(fakeResponse());
    const b = subscribe(fakeResponse());

    expect(a.mapId).toMatch(MAP_ID_PATTERN);
    expect(b.mapId).toMatch(MAP_ID_PATTERN);
    expect(a.mapId).not.toBe(b.mapId);
  });

  it('writes an SSE frame only to the map it is addressed to', () => {
    const a = fakeResponse();
    const b = fakeResponse();
    const { mapId } = subscribe(a);
    subscribe(b);

    expect(publish(mapId, EVENT)).toBe(true);
    expect(a.write).toHaveBeenCalledWith(`event: navigate\ndata: ${JSON.stringify(EVENT)}\n\n`);
    expect(b.write).not.toHaveBeenCalled();
  });

  it('returns false for an id no open map has', () => {
    const a = fakeResponse();
    subscribe(a);

    expect(publish('zzzzzz', EVENT)).toBe(false);
    expect(a.write).not.toHaveBeenCalled();
  });

  it('stops writing to a map once it unsubscribes', () => {
    const a = fakeResponse();
    const { mapId, unsubscribe } = subscribe(a);
    unsubscribe();

    expect(isMapOpen(mapId)).toBe(false);
    expect(publish(mapId, EVENT)).toBe(false);
    expect(a.write).not.toHaveBeenCalled();
  });

  it('keeps a requested id when it is free, so a reloaded tab keeps its id', () => {
    expect(subscribe(fakeResponse(), 'k3f9xq').mapId).toBe('k3f9xq');
  });

  it('assigns a fresh id when the requested one is malformed', () => {
    expect(subscribe(fakeResponse(), 'NOT-AN-ID').mapId).toMatch(MAP_ID_PATTERN);
  });

  it('lets a reconnect with an existing id take it over from the stale connection', () => {
    const stale = fakeResponse();
    const current = fakeResponse();
    const old = subscribe(stale, 'k3f9xq');

    expect(subscribe(current, 'k3f9xq').mapId).toBe('k3f9xq');
    expect(stale.write).toHaveBeenCalledWith('event: superseded\ndata: {}\n\n');
    expect(stale.end).toHaveBeenCalledTimes(1);

    old.unsubscribe(); // the stale connection's late close
    expect(isMapOpen('k3f9xq')).toBe(true);
    expect(publish('k3f9xq', EVENT)).toBe(true);
    expect(current.write).toHaveBeenCalledWith(`event: navigate\ndata: ${JSON.stringify(EVENT)}\n\n`);
    expect(stale.write).toHaveBeenCalledTimes(1); // only the superseded frame
    expect(listMaps()).toHaveLength(1);
  });

  it("doesn't end a stale response that has already ended", () => {
    const stale = fakeResponse();
    subscribe(stale, 'k3f9xq');
    stale.end();
    subscribe(fakeResponse(), 'k3f9xq');

    expect(stale.end).toHaveBeenCalledTimes(1);
  });

  it('keeps the last reported view when a reconnect takes over an id', () => {
    subscribe(fakeResponse(), 'k3f9xq');
    updateView('k3f9xq', VIEW);
    subscribe(fakeResponse(), 'k3f9xq');

    expect(listMaps()).toEqual([expect.objectContaining({ mapId: 'k3f9xq', view: VIEW })]);
  });

  it('lists open maps with their last reported view', () => {
    const { mapId: a } = subscribe(fakeResponse());
    const { mapId: b } = subscribe(fakeResponse());

    expect(updateView(a, VIEW)).toBe(true);
    expect(updateView('zzzzzz', VIEW)).toBe(false);

    const maps = listMaps();
    expect(maps.map((m) => m.mapId)).toEqual([a, b]);
    expect(maps[0].view).toEqual(VIEW);
    expect(maps[1].view).toBeUndefined();
    expect(Date.parse(maps[0].connectedAt)).not.toBeNaN();
  });
});
