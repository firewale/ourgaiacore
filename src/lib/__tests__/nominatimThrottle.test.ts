// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { throttledFetch as ThrottledFetch } from '../nominatimThrottle.js';

let throttledFetch: typeof ThrottledFetch;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  ({ throttledFetch } = await import('../nominatimThrottle.js'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('throttledFetch', () => {
  it('serializes concurrent calls with at least a 1.1s gap between underlying fetches', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const p1 = throttledFetch('https://example.com/a');
    const p2 = throttledFetch('https://example.com/b');

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1100);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await Promise.all([p1, p2]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/a');
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/b');
  });

  it('does not block subsequently queued calls when a call rejects', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const p1 = throttledFetch('https://example.com/a').catch(() => 'failed');
    const p2 = throttledFetch('https://example.com/b');

    await vi.advanceTimersByTimeAsync(1100);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('failed');
    expect(r2).toEqual({ ok: true });
  });
});
