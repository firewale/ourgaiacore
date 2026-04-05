import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showBanner, hideBanner } from '../banner.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="error-banner" hidden></div>';
  vi.clearAllMocks();
  vi.useFakeTimers();
});

describe('showBanner', () => {
  it('removes the hidden attribute and sets the message', () => {
    showBanner('Something went wrong');
    const banner = document.getElementById('error-banner')!;
    expect(banner.hasAttribute('hidden')).toBe(false);
    expect(banner.textContent).toBe('Something went wrong');
  });

  it('auto-dismisses after the specified duration', () => {
    showBanner('Wait please', 1000);
    const banner = document.getElementById('error-banner')!;
    expect(banner.hasAttribute('hidden')).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(banner.hasAttribute('hidden')).toBe(true);
  });

  it('resets the dismiss timer when called again before expiry', () => {
    showBanner('First message', 1000);
    vi.advanceTimersByTime(800);
    showBanner('Second message', 1000);
    vi.advanceTimersByTime(800);
    // 1600ms total — first timer would have fired at 1000ms but was reset
    expect(document.getElementById('error-banner')!.hasAttribute('hidden')).toBe(false);
    vi.advanceTimersByTime(200);
    expect(document.getElementById('error-banner')!.hasAttribute('hidden')).toBe(true);
  });
});

describe('hideBanner', () => {
  it('sets the hidden attribute', () => {
    showBanner('Visible');
    hideBanner();
    expect(document.getElementById('error-banner')!.hasAttribute('hidden')).toBe(true);
  });

  it('cancels the auto-dismiss timer', () => {
    showBanner('Will be hidden manually', 1000);
    hideBanner();
    vi.advanceTimersByTime(1000);
    // No error thrown — timer was safely cancelled
    expect(document.getElementById('error-banner')!.hasAttribute('hidden')).toBe(true);
  });
});
