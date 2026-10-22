const apiUrl = '/api/map-events';

export interface NavigateEvent {
  lat: number;
  lng: number;
  zoom: number;
  displayName: string;
}

export interface FilterEvent {
  mode: 'only' | 'show' | 'hide' | 'all';
  categories: string[];
}

function isFilterEvent(value: unknown): value is FilterEvent {
  if (typeof value !== 'object' || value === null) return false;
  const { mode, categories } = value as Record<string, unknown>;
  return (
    (mode === 'only' || mode === 'show' || mode === 'hide' || mode === 'all') &&
    Array.isArray(categories) &&
    categories.every((c) => typeof c === 'string')
  );
}

function isNavigateEvent(value: unknown): value is NavigateEvent {
  if (typeof value !== 'object' || value === null) return false;
  const { lat, lng, zoom, displayName } = value as Record<string, unknown>;
  return (
    typeof lat === 'number' && Number.isFinite(lat) &&
    typeof lng === 'number' && Number.isFinite(lng) &&
    typeof zoom === 'number' && Number.isFinite(zoom) &&
    typeof displayName === 'string'
  );
}

export interface MapView {
  lat: number;
  lng: number;
  zoom: number;
  hiddenCategories: string[];
}

const STORAGE_KEY = 'ourgaia.mapId';
const RECONNECT_MS = 2000;
const MAX_RECONNECT_MS = 30000;
const VIEW_REPORT_DEBOUNCE_MS = 500;

let mapId: string | undefined;
let pendingView: MapView | undefined;
let viewTimer: ReturnType<typeof setTimeout> | undefined;

// sessionStorage is per tab and survives a reload, so a reloaded tab keeps
// the id the user may already have handed to an MCP client.
function storedMapId(): string | undefined {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeMapId(id: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private mode etc. — the id just won't survive a reload.
  }
}

function clearStoredMapId(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored to clear.
  }
}

// The id MCP tools and the chat use to target this tab's map (and no other).
export function getMapId(): string | undefined {
  return mapId;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSession(value: unknown): value is { mapId: string } {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).mapId === 'string';
}

// Listens for server-pushed map commands (from MCP tool calls, whether made by
// an external MCP client or the in-app chat) addressed to this tab's map id.
// Reconnects itself rather than relying on EventSource's own retry, so each
// reconnect asks for the id this tab currently has, not the one it first asked for.
// 'superseded' means another connection took this id over (a duplicated tab, or
// this tab's own reconnect racing a stale stream) — take a fresh id instead of
// taking it back, or the two tabs would trade it every reconnect.
export function connect(
  onNavigate: (event: NavigateEvent) => void,
  onFilter?: (event: FilterEvent) => void,
  onSession?: (mapId: string) => void
): void {
  // Doubles after each failed attempt (2s, 4s, … 30s) so a server that stays
  // down isn't hit every 2s by every tab; reset once a session is assigned.
  let reconnectMs = RECONNECT_MS;
  const open = (requestedId: string | undefined): void => {
    const source = new EventSource(requestedId ? `${apiUrl}?mapId=${encodeURIComponent(requestedId)}` : apiUrl);
    listen(source, 'session', isSession, ({ mapId: id }) => {
      reconnectMs = RECONNECT_MS;
      mapId = id;
      storeMapId(id);
      onSession?.(id);
      if (pendingView) reportView(pendingView);
    });
    listen(source, 'navigate', isNavigateEvent, onNavigate);
    if (onFilter) listen(source, 'filter', isFilterEvent, onFilter);
    let superseded = false;
    listen(source, 'superseded', isObject, () => {
      superseded = true;
      source.close();
      mapId = undefined;
      clearStoredMapId();
      open(undefined);
    });
    source.addEventListener('error', () => {
      if (superseded) return;
      source.close();
      setTimeout(() => open(mapId ?? requestedId), reconnectMs);
      reconnectMs = Math.min(reconnectMs * 2, MAX_RECONNECT_MS);
    });
  };
  open(storedMapId());
}

// Tells the server where this map is and what it hides, so list_maps can
// describe it. Debounced, and held until the stream has assigned an id.
export function reportView(view: MapView): void {
  pendingView = view;
  if (!mapId) return;
  clearTimeout(viewTimer);
  viewTimer = setTimeout(() => {
    if (!mapId || !pendingView) return;
    fetch(`${apiUrl}/${encodeURIComponent(mapId)}/view`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingView),
    }).catch((err) => console.error('Map view report failed:', err));
  }, VIEW_REPORT_DEBOUNCE_MS);
}

export function _resetMapEventsForTests(): void {
  mapId = undefined;
  pendingView = undefined;
  clearTimeout(viewTimer);
  viewTimer = undefined;
}

function listen<T>(
  source: EventSource,
  type: string,
  isValid: (value: unknown) => value is T,
  handler: (event: T) => void
): void {
  source.addEventListener(type, (e) => {
    let data: unknown;
    try {
      data = JSON.parse((e as MessageEvent<string>).data);
    } catch {
      console.error('Malformed map event:', (e as MessageEvent<string>).data);
      return;
    }
    if (!isValid(data)) {
      console.error('Unexpected map event payload:', data);
      return;
    }
    handler(data);
  });
}
