import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendMessage, clearHistory, initialize, collapseChat, type ChatSendStatus } from '../chat.js';

function makeStreamingResponse(lines: string[], ok = true) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok,
    body: {
      getReader() {
        return {
          read: async () => {
            if (i < lines.length) {
              return { done: false, value: encoder.encode(lines[i++]) };
            }
            return { done: true, value: undefined };
          },
        };
      },
    },
  };
}

beforeEach(() => {
  clearHistory();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('sendMessage', () => {
  it('posts the accumulated history to /api/chat', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      makeStreamingResponse(['{"content":"Hi there!"}\n'])
    );
    vi.stubGlobal('fetch', fetchMock);

    await sendMessage('Hello', vi.fn());

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/chat');
    const body = JSON.parse(options.body as string);
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('invokes onUpdate with the accumulated text for each chunk and returns ok', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      makeStreamingResponse(['{"content":"Hi "}\n', '{"content":"there!"}\n'])
    );
    vi.stubGlobal('fetch', fetchMock);

    const onUpdate = vi.fn();
    const status: ChatSendStatus = await sendMessage('Hello', onUpdate);

    expect(status).toBe('ok');
    expect(onUpdate).toHaveBeenNthCalledWith(1, 'Hi ');
    expect(onUpdate).toHaveBeenNthCalledWith(2, 'Hi there!');
  });

  it('accumulates history across multiple turns', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeStreamingResponse(['{"content":"First reply"}\n']))
      .mockResolvedValueOnce(makeStreamingResponse(['{"content":"Second reply"}\n']));
    vi.stubGlobal('fetch', fetchMock);

    await sendMessage('First message', vi.fn());
    await sendMessage('Second message', vi.fn());

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody.messages).toEqual([
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'First reply' },
      { role: 'user', content: 'Second message' },
    ]);
  });

  it('returns error and does not throw when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network error')));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const status = await sendMessage('Hello', vi.fn());
    expect(status).toBe('error');
  });

  it('returns error when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 502, body: null }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const status = await sendMessage('Hello', vi.fn());
    expect(status).toBe('error');
  });

  it('returns error when the response has no body to stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, body: null }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const status = await sendMessage('Hello', vi.fn());
    expect(status).toBe('error');
  });

  it('returns error when the stream yields no content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeStreamingResponse([])));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const status = await sendMessage('Hello', vi.fn());
    expect(status).toBe('error');
  });

  it('clearHistory resets accumulated history', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeStreamingResponse(['{"content":"reply"}\n']))
      .mockResolvedValueOnce(makeStreamingResponse(['{"content":"reply"}\n']));
    vi.stubGlobal('fetch', fetchMock);

    await sendMessage('Hello', vi.fn());
    clearHistory();
    await sendMessage('Fresh start', vi.fn());

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody.messages).toEqual([{ role: 'user', content: 'Fresh start' }]);
  });
});

describe('initialize', () => {
  it('renders a pill and a hidden window; clicking the pill opens it', () => {
    const container = document.createElement('div');
    initialize(container);
    const pill = container.querySelector('#chat-pill') as HTMLButtonElement;
    const win = container.querySelector('#chat-window') as HTMLElement;

    expect(pill).not.toBeNull();
    expect(pill.hidden).toBe(false);
    expect(win.hidden).toBe(true);

    pill.click();
    expect(pill.hidden).toBe(true);
    expect(win.hidden).toBe(false);
  });

  it('minimizing the window hides it and shows the pill again', () => {
    const container = document.createElement('div');
    initialize(container);
    const pill = container.querySelector('#chat-pill') as HTMLButtonElement;
    const win = container.querySelector('#chat-window') as HTMLElement;
    const minimizeBtn = container.querySelector('#chat-minimize') as HTMLButtonElement;

    pill.click();
    expect(win.hidden).toBe(false);

    minimizeBtn.click();
    expect(win.hidden).toBe(true);
    expect(pill.hidden).toBe(false);
  });

  it('calls onOpen when the pill is clicked', () => {
    const container = document.createElement('div');
    const onOpen = vi.fn();
    initialize(container, onOpen);
    const pill = container.querySelector('#chat-pill') as HTMLButtonElement;

    pill.click();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('collapseChat hides the window and shows the pill', () => {
    const container = document.createElement('div');
    initialize(container);
    const pill = container.querySelector('#chat-pill') as HTMLButtonElement;
    const win = container.querySelector('#chat-window') as HTMLElement;

    pill.click();
    expect(win.hidden).toBe(false);

    collapseChat();
    expect(win.hidden).toBe(true);
    expect(pill.hidden).toBe(false);
  });
});
