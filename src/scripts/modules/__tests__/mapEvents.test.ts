import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connect, getMapId, reportView, _resetMapEventsForTests } from '../mapEvents.js';

class FakeEventSource {
  static last: FakeEventSource;
  listeners: Record<string, (e: MessageEvent<string>) => void> = {};
  close = vi.fn();

  constructor(public url: string) {
    FakeEventSource.last = this;
  }

  addEventListener(type: string, cb: (e: MessageEvent<string>) => void): void {
    this.listeners[type] = cb;
  }

  emit(type: string, data: string): void {
    this.listeners[type]?.({ data } as MessageEvent<string>);
  }
}

const VIEW = { lat: 1, lng: 2, zoom: 12, hiddenCategories: [] };

beforeEach(() => {
  vi.useRealTimers();
  _resetMapEventsForTests();
  sessionStorage.clear();
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('mapEvents.connect', () => {
  it('subscribes to the map events stream', () => {
    connect(vi.fn());
    expect(FakeEventSource.last.url).toBe('/api/map-events');
  });

  it('stores the map id the server assigns and reports it', () => {
    const onSession = vi.fn();
    connect(vi.fn(), undefined, onSession);

    FakeEventSource.last.emit('session', JSON.stringify({ mapId: 'k3f9xq' }));

    expect(getMapId()).toBe('k3f9xq');
    expect(onSession).toHaveBeenCalledWith('k3f9xq');
    expect(sessionStorage.getItem('ourgaia.mapId')).toBe('k3f9xq');
  });

  it('asks for the stored map id back after a reload', () => {
    sessionStorage.setItem('ourgaia.mapId', 'k3f9xq');
    connect(vi.fn());
    expect(FakeEventSource.last.url).toBe('/api/map-events?mapId=k3f9xq');
  });

  it('reconnects on error, asking for the id it was last assigned', () => {
    vi.useFakeTimers();
    sessionStorage.setItem('ourgaia.mapId', 'aaaaaa');
    connect(vi.fn());
    const first = FakeEventSource.last;
    first.emit('session', JSON.stringify({ mapId: 'k3f9xq' }));

    first.emit('error', '');
    expect(first.close).toHaveBeenCalled();
    vi.advanceTimersByTime(2000);

    expect(FakeEventSource.last).not.toBe(first);
    expect(FakeEventSource.last.url).toBe('/api/map-events?mapId=k3f9xq');
  });

  it('backs off between failed reconnects, and resets once a session is assigned', () => {
    vi.useFakeTimers();
    connect(vi.fn());
    const first = FakeEventSource.last;

    first.emit('error', '');
    vi.advanceTimersByTime(2000);
    const second = FakeEventSource.last;
    expect(second).not.toBe(first);

    second.emit('error', '');
    vi.advanceTimersByTime(2000);
    expect(FakeEventSource.last).toBe(second); // now waiting 4s
    vi.advanceTimersByTime(2000);
    const third = FakeEventSource.last;
    expect(third).not.toBe(second);

    third.emit('session', JSON.stringify({ mapId: 'k3f9xq' }));
    third.emit('error', '');
    vi.advanceTimersByTime(2000);
    expect(FakeEventSource.last).not.toBe(third);
  });

  it('takes a fresh id when another connection supersedes this one', () => {
    vi.useFakeTimers();
    sessionStorage.setItem('ourgaia.mapId', 'k3f9xq');
    connect(vi.fn());
    const first = FakeEventSource.last;
    first.emit('session', JSON.stringify({ mapId: 'k3f9xq' }));

    first.emit('superseded', '{}');
    first.emit('error', ''); // the server ending the stream — must not reconnect with the old id
    vi.advanceTimersByTime(2000);

    expect(first.close).toHaveBeenCalled();
    expect(FakeEventSource.last).not.toBe(first);
    expect(FakeEventSource.last.url).toBe('/api/map-events');
    expect(getMapId()).toBeUndefined();
    expect(sessionStorage.getItem('ourgaia.mapId')).toBeNull();
  });

  it('calls onNavigate with a valid navigate event', () => {
    const onNavigate = vi.fn();
    connect(onNavigate);

    FakeEventSource.last.emit('navigate', JSON.stringify({ type: 'navigate', lat: 35, lng: 135, zoom: 10, displayName: 'Kyoto' }));

    expect(onNavigate).toHaveBeenCalledWith({ type: 'navigate', lat: 35, lng: 135, zoom: 10, displayName: 'Kyoto' });
  });

  it('ignores malformed JSON', () => {
    const onNavigate = vi.fn();
    connect(onNavigate);

    FakeEventSource.last.emit('navigate', '{not json');

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('ignores a payload missing coordinates', () => {
    const onNavigate = vi.fn();
    connect(onNavigate);

    FakeEventSource.last.emit('navigate', JSON.stringify({ type: 'navigate', lat: 35, zoom: 10, displayName: 'Kyoto' }));

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('calls onFilter with a valid filter event', () => {
    const onFilter = vi.fn();
    connect(vi.fn(), onFilter);

    FakeEventSource.last.emit('filter', JSON.stringify({ type: 'filter', mode: 'only', categories: ['museum'] }));

    expect(onFilter).toHaveBeenCalledWith({ type: 'filter', mode: 'only', categories: ['museum'] });
  });

  it('ignores a filter event with an unknown mode', () => {
    const onFilter = vi.fn();
    connect(vi.fn(), onFilter);

    FakeEventSource.last.emit('filter', JSON.stringify({ type: 'filter', mode: 'invert', categories: [] }));

    expect(onFilter).not.toHaveBeenCalled();
  });
});

describe('mapEvents.reportView', () => {
  it('holds the view until a map id is assigned, then PUTs it (debounced)', () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    connect(vi.fn());

    reportView(VIEW);
    vi.advanceTimersByTime(1000);
    expect(fetchMock).not.toHaveBeenCalled();

    FakeEventSource.last.emit('session', JSON.stringify({ mapId: 'k3f9xq' }));
    reportView({ ...VIEW, zoom: 13 });
    vi.advanceTimersByTime(500);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/map-events/k3f9xq/view');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body as string)).toEqual({ ...VIEW, zoom: 13 });
  });
});
