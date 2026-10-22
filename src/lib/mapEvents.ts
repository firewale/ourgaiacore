import { randomInt } from 'node:crypto';
import type { Response } from 'express';

export interface NavigateEvent {
  type: 'navigate';
  lat: number;
  lng: number;
  zoom: number;
  displayName: string;
}

export type FilterMode = 'only' | 'show' | 'hide' | 'all';

export interface FilterEvent {
  type: 'filter';
  mode: FilterMode;
  categories: string[];
}

export type MapEvent = NavigateEvent | FilterEvent;

// What a tab last reported about its map, so list_maps can describe it.
export interface MapView {
  lat: number;
  lng: number;
  zoom: number;
  hiddenCategories: string[];
}

export interface OpenMapInfo {
  mapId: string;
  connectedAt: string;
  view?: MapView;
}

// Every open map tab holds one SSE connection here, keyed by a short map id
// the tab shows the user. Events only ever go to the one map a caller names —
// never broadcast — so a tool can't change a map nobody pointed it at.
const maps = new Map<string, { res: Response; connectedAt: string; view?: MapView }>();

// No 0/o/1/l/i, so an id read off the screen and typed back can't be misread.
const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const ID_LENGTH = 6;
export const MAP_ID_PATTERN = new RegExp(`^[${ID_ALPHABET}]{${ID_LENGTH}}$`);

function newMapId(): string {
  let id: string;
  do {
    id = Array.from({ length: ID_LENGTH }, () => ID_ALPHABET[randomInt(ID_ALPHABET.length)]).join('');
  } while (maps.has(id));
  return id;
}

// A reconnecting tab (reload, sleep, network drop) asks for its previous id
// back so the id the user copied keeps working. The server may still hold the
// old, dead connection under that id — it only notices on a failed heartbeat —
// so the new connection takes the id over: the old stream is told it was
// superseded and ended, and its last reported view kept. If the old tab is
// still alive (a duplicated tab copies sessionStorage), 'superseded' makes it
// ask for a fresh id rather than take this one back. A malformed id gets a fresh one.
export function subscribe(res: Response, requestedId?: string): { mapId: string; unsubscribe: () => void } {
  const mapId = requestedId && MAP_ID_PATTERN.test(requestedId) ? requestedId : newMapId();
  const previous = maps.get(mapId);
  maps.set(mapId, { res, connectedAt: new Date().toISOString(), ...(previous?.view ? { view: previous.view } : {}) });
  if (previous && previous.res !== res && !previous.res.writableEnded) {
    previous.res.write('event: superseded\ndata: {}\n\n');
    previous.res.end();
  }
  return {
    mapId,
    // Only removes this connection's own entry, so a taken-over connection
    // closing late doesn't drop the one that replaced it.
    unsubscribe: () => {
      if (maps.get(mapId)?.res === res) maps.delete(mapId);
    },
  };
}

export function isMapOpen(mapId: string): boolean {
  return maps.has(mapId);
}

// Returns false when no open map has this id.
export function publish(mapId: string, event: MapEvent): boolean {
  const map = maps.get(mapId);
  if (!map) return false;
  map.res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  return true;
}

export function updateView(mapId: string, view: MapView): boolean {
  const map = maps.get(mapId);
  if (!map) return false;
  map.view = view;
  return true;
}

export function listMaps(): OpenMapInfo[] {
  return [...maps].map(([mapId, { connectedAt, view }]) => ({ mapId, connectedAt, ...(view ? { view } : {}) }));
}

export function unknownMapError(mapId: string): string {
  return (
    `No open OurGaia map has id "${mapId}". The id is shown on the map in the user's browser — ` +
    'ask the user for it, or call list_maps to show them the open maps.'
  );
}

export function _resetMapEventsForTests(): void {
  maps.clear();
}
