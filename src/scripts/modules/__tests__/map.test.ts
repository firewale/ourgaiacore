import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as map from '../map.js';
import { showBanner } from '../banner.js';
import type * as MarkerModule from '../marker.js';
import type * as WikipediaModule from '../wikipedia.js';
import type * as SearchModule from '../search.js';

const { FakeMap, getLastInstance, resetInstances } = vi.hoisted(() => {
  const instances: InstanceType<typeof FakeMapImpl>[] = [];

  class FakeMapImpl {
    public options: { container: string; style: string; center: [number, number]; zoom: number };
    public center: [number, number];
    public zoomLevel: number;
    public lastControlElement: HTMLElement | undefined;
    private listeners: Record<string, Array<(e?: { originalEvent?: unknown }) => void>> = {};
    private container = document.createElement('div');

    constructor(options: { container: string; style: string; center: [number, number]; zoom: number }) {
      this.options = options;
      this.center = options.center;
      this.zoomLevel = options.zoom;
      instances.push(this);
    }

    on(event: string, cb: (e?: { originalEvent?: unknown }) => void): void {
      (this.listeners[event] ??= []).push(cb);
    }

    off(): void {}

    addControl(control: { onAdd: (map: unknown) => HTMLElement }): void {
      this.lastControlElement = control.onAdd(this);
    }

    getCenter(): { lng: number; lat: number } {
      return { lng: this.center[0], lat: this.center[1] };
    }

    getZoom(): number {
      return this.zoomLevel;
    }

    setCenter(c: [number, number]): void {
      this.center = c;
    }

    setZoom(z: number): void {
      this.zoomLevel = z;
    }

    getContainer(): HTMLElement {
      return this.container;
    }

    fireIdle(): void {
      this.listeners['idle']?.forEach((cb) => cb());
    }

    fireMovestart(originalEvent?: unknown): void {
      this.listeners['movestart']?.forEach((cb) => cb({ originalEvent }));
    }
  }

  return {
    FakeMap: FakeMapImpl,
    getLastInstance: () => instances[instances.length - 1],
    resetInstances: () => { instances.length = 0; },
  };
});

vi.mock('maplibre-gl', () => ({
  MapLibreMap: FakeMap,
  Marker: vi.fn(),
  Popup: vi.fn(),
}));

function makeFakeMarker(): { remove: ReturnType<typeof vi.fn>; addTo: ReturnType<typeof vi.fn> } {
  return { remove: vi.fn(), addTo: vi.fn() };
}

const fakeMarkerMod = {
  getCircleIcon: vi.fn(() => document.createElement('div')),
  getCategoryIcon: vi.fn(() => document.createElement('div')),
  placeMapMarker: vi.fn(() => makeFakeMarker()),
} as unknown as typeof MarkerModule;

const fakeWikipediaMod = {
  getWikipediaData: vi.fn(async () => 'ok' as const),
} as unknown as typeof WikipediaModule;

const fakeSearchMod = {
  BuildSearchControl: vi.fn(),
} as unknown as typeof SearchModule;

beforeEach(() => {
  vi.clearAllMocks();
  resetInstances();
  map._resetMapStateForTests();
  document.body.innerHTML = '<div id="error-banner" hidden></div>';
});

describe('initialize', () => {
  it('constructs the map with the flipped [lng, lat] center and the default style URL', () => {
    map.initialize({ lat: 12, lng: 34 }, fakeMarkerMod, fakeWikipediaMod, fakeSearchMod);

    const instance = getLastInstance();
    expect(instance.options.center).toEqual([34, 12]);
    expect(instance.options.style).toBe('https://tiles.openfreemap.org/styles/liberty');
  });

  it('uses a custom style URL when provided', () => {
    map.initialize({ lat: 0, lng: 0 }, fakeMarkerMod, fakeWikipediaMod, fakeSearchMod, 'https://example.com/style.json');

    const instance = getLastInstance();
    expect(instance.options.style).toBe('https://example.com/style.json');
  });
});

describe('idle-debounced Wikipedia refetch', () => {
  it('collapses rapid idle events into a single fetch', async () => {
    vi.useFakeTimers();
    try {
      map.initialize({ lat: 1, lng: 2 }, fakeMarkerMod, fakeWikipediaMod, fakeSearchMod);
      const instance = getLastInstance();

      instance.fireIdle();
      instance.fireIdle();
      instance.fireIdle();

      await vi.advanceTimersByTimeAsync(800);

      expect(fakeWikipediaMod.getWikipediaData).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not dismiss an unrelated banner on a normal (non-rate-limited) fetch', async () => {
    vi.useFakeTimers();
    try {
      map.initialize({ lat: 1, lng: 2 }, fakeMarkerMod, fakeWikipediaMod, fakeSearchMod);
      const instance = getLastInstance();

      showBanner('Some unrelated notice', 60000);
      const banner = document.getElementById('error-banner')!;
      expect(banner.hasAttribute('hidden')).toBe(false);

      instance.fireIdle();
      await vi.advanceTimersByTimeAsync(800);

      expect(banner.hasAttribute('hidden')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a rate-limit banner and clears it once fetches succeed again', async () => {
    vi.useFakeTimers();
    try {
      const wikipediaMod = {
        getWikipediaData: vi.fn()
          .mockResolvedValueOnce('rate-limited' as const)
          .mockResolvedValueOnce('ok' as const),
      } as unknown as typeof WikipediaModule;

      map.initialize({ lat: 1, lng: 2 }, fakeMarkerMod, wikipediaMod, fakeSearchMod);
      const instance = getLastInstance();
      const banner = document.getElementById('error-banner')!;

      instance.fireIdle();
      await vi.advanceTimersByTimeAsync(800);
      expect(banner.hasAttribute('hidden')).toBe(false);

      instance.fireIdle();
      await vi.advanceTimersByTimeAsync(800);
      expect(banner.hasAttribute('hidden')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('recenterToUserLocation', () => {
  it('pans the map and replaces the origin marker when the user has not interacted', () => {
    map.initialize({ lat: 0, lng: 0 }, fakeMarkerMod, fakeWikipediaMod, fakeSearchMod);
    const instance = getLastInstance();
    const initialMarker = (fakeMarkerMod.placeMapMarker as ReturnType<typeof vi.fn>).mock.results[0].value;

    map.recenterToUserLocation({ lat: 10, lng: 20 });

    expect(instance.center).toEqual([20, 10]);
    expect(initialMarker.remove).toHaveBeenCalled();
    expect(fakeMarkerMod.placeMapMarker).toHaveBeenCalledTimes(2);
    // Recenter shouldn't reopen the welcome popup a second time.
    expect((fakeMarkerMod.placeMapMarker as ReturnType<typeof vi.fn>).mock.calls[1][5]).toBe(false);
  });

  it('does nothing once the user has panned/zoomed the map themselves', () => {
    map.initialize({ lat: 0, lng: 0 }, fakeMarkerMod, fakeWikipediaMod, fakeSearchMod);
    const instance = getLastInstance();
    instance.fireMovestart(new MouseEvent('mousedown'));
    vi.clearAllMocks();

    map.recenterToUserLocation({ lat: 10, lng: 20 });

    expect(instance.center).toEqual([0, 0]);
    expect(fakeMarkerMod.placeMapMarker).not.toHaveBeenCalled();
  });

  it('does nothing once the user has searched for a location', () => {
    map.initialize({ lat: 0, lng: 0 }, fakeMarkerMod, fakeWikipediaMod, fakeSearchMod);
    const instance = getLastInstance();
    map.setPosition({ lat: 5, lng: 5 });
    vi.clearAllMocks();

    map.recenterToUserLocation({ lat: 10, lng: 20 });

    expect(instance.center).toEqual([5, 5]);
    expect(fakeMarkerMod.placeMapMarker).not.toHaveBeenCalled();
  });

  it('does not leave a stray marker behind from the initial placeholder location', () => {
    map.initialize({ lat: 0, lng: 0 }, fakeMarkerMod, fakeWikipediaMod, fakeSearchMod);
    const initialMarker = (fakeMarkerMod.placeMapMarker as ReturnType<typeof vi.fn>).mock.results[0].value;

    map.setPosition({ lat: 5, lng: 5 });

    expect(initialMarker.remove).toHaveBeenCalled();
  });
});

describe('plotLandmarks', () => {
  it('adds markers for new articles and removes markers for articles no longer present', () => {
    map.initialize({ lat: 0, lng: 0 }, fakeMarkerMod, fakeWikipediaMod, fakeSearchMod);
    vi.clearAllMocks(); // drop the "you are here" marker call from initialize

    const markerA = makeFakeMarker();
    const markerB = makeFakeMarker();
    (fakeMarkerMod.placeMapMarker as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(markerA)
      .mockReturnValueOnce(markerB);

    map.plotLandmarks({
      1: { pageId: 1, title: 'A', lat: 1, long: 1, category: 'museum' },
      2: { pageId: 2, title: 'B', lat: 2, long: 2, category: 'park' },
    });
    expect(fakeMarkerMod.placeMapMarker).toHaveBeenCalledTimes(2);

    map.plotLandmarks({
      1: { pageId: 1, title: 'A', lat: 1, long: 1, category: 'museum' },
    });

    expect(markerB.remove).toHaveBeenCalled();
    expect(markerA.remove).not.toHaveBeenCalled();
  });
});

describe('legend category filtering', () => {
  it('removes and restores markers via the legend checkboxes', () => {
    map.initialize({ lat: 0, lng: 0 }, fakeMarkerMod, fakeWikipediaMod, fakeSearchMod);
    const instance = getLastInstance();

    const museumMarker = makeFakeMarker();
    const parkMarker = makeFakeMarker();
    (fakeMarkerMod.placeMapMarker as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(museumMarker)
      .mockReturnValueOnce(parkMarker);

    map.plotLandmarks({
      1: { pageId: 1, title: 'Museum', lat: 1, long: 1, category: 'museum' },
      2: { pageId: 2, title: 'Park', lat: 2, long: 2, category: 'park' },
    });

    const checkbox = instance.lastControlElement!.querySelector<HTMLInputElement>('input[data-category="museum"]')!;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));

    expect(museumMarker.remove).toHaveBeenCalled();
    expect(parkMarker.remove).not.toHaveBeenCalled();

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    expect(museumMarker.addTo).toHaveBeenCalled();
  });
});
