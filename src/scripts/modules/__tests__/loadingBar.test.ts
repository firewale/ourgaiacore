import { describe, it, expect, beforeEach } from 'vitest';
import { beginLoading, endLoading, _resetLoadingBarForTests } from '../loadingBar.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="loading-bar" hidden></div>';
  _resetLoadingBarForTests();
});

describe('beginLoading', () => {
  it('removes the hidden attribute', () => {
    beginLoading();
    expect(document.getElementById('loading-bar')!.hasAttribute('hidden')).toBe(false);
  });

  it('builds the globe artwork into the container', () => {
    beginLoading();
    const svg = document.getElementById('loading-bar')!.querySelector('svg');
    expect(svg).not.toBeNull();
    // Scrolling map layer plus at least one land/ice block drawn onto it.
    expect(svg!.querySelector('.loading-bar__map')).not.toBeNull();
    expect(svg!.querySelectorAll('rect').length).toBeGreaterThan(1);
  });

  it('does not duplicate the globe when called repeatedly', () => {
    beginLoading();
    beginLoading();
    beginLoading();
    expect(document.getElementById('loading-bar')!.querySelectorAll('svg').length).toBe(1);
  });

  it('rebuilds the globe after the container is replaced', () => {
    beginLoading();
    // The markup is generated rather than authored in index.html, so a fresh
    // container (as on a re-render) has to get its artwork back.
    document.body.innerHTML = '<div id="loading-bar" hidden></div>';
    expect(document.getElementById('loading-bar')!.querySelector('svg')).toBeNull();

    beginLoading();
    expect(document.getElementById('loading-bar')!.querySelector('svg')).not.toBeNull();
  });
});

describe('endLoading', () => {
  it('sets the hidden attribute after a single beginLoading', () => {
    beginLoading();
    endLoading();
    expect(document.getElementById('loading-bar')!.hasAttribute('hidden')).toBe(true);
  });

  it('stays visible while any overlapping fetch is still in flight', () => {
    beginLoading();
    beginLoading();
    endLoading();
    expect(document.getElementById('loading-bar')!.hasAttribute('hidden')).toBe(false);

    endLoading();
    expect(document.getElementById('loading-bar')!.hasAttribute('hidden')).toBe(true);
  });

  it('does not go negative when called more than beginLoading', () => {
    endLoading();
    endLoading();
    beginLoading();
    expect(document.getElementById('loading-bar')!.hasAttribute('hidden')).toBe(false);

    endLoading();
    expect(document.getElementById('loading-bar')!.hasAttribute('hidden')).toBe(true);
  });
});
