import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendMessage, clearHistory, newChat, initialize, collapseChat, type ChatSendStatus } from '../chat.js';
import { setVisibleArticles } from '../mapContext.js';

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
  setVisibleArticles([]);
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

  it('sends an empty candidates array when no landmarks are visible', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      makeStreamingResponse(['{"content":"Hi there!"}\n'])
    );
    vi.stubGlobal('fetch', fetchMock);

    await sendMessage('Hello', vi.fn());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.candidates).toEqual([]);
  });

  it('sends the currently visible landmarks as candidates', async () => {
    setVisibleArticles([
      { title: 'City Museum', lat: 1, long: 2, pageId: 42, extract: '<p>A museum.</p>', category: 'museum' },
    ]);
    const fetchMock = vi.fn().mockResolvedValueOnce(
      makeStreamingResponse(['{"content":"Hi there!"}\n'])
    );
    vi.stubGlobal('fetch', fetchMock);

    await sendMessage('Tell me about the museum', vi.fn());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.candidates).toEqual([
      { pageId: 42, title: 'City Museum', extract: '<p>A museum.</p>', category: 'museum' },
    ]);
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

  it('newChat resets accumulated history', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeStreamingResponse(['{"content":"reply"}\n']))
      .mockResolvedValueOnce(makeStreamingResponse(['{"content":"reply"}\n']));
    vi.stubGlobal('fetch', fetchMock);

    await sendMessage('Hello', vi.fn());
    newChat();
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

  it('clicking the new-chat button clears rendered messages and history', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeStreamingResponse(['{"content":"Hi there!"}\n']))
      .mockResolvedValueOnce(makeStreamingResponse(['{"content":"reply"}\n']));
    vi.stubGlobal('fetch', fetchMock);

    const container = document.createElement('div');
    initialize(container);
    (container.querySelector('#chat-pill') as HTMLButtonElement).click();

    const input = container.querySelector('#chat-input') as HTMLInputElement;
    const sendBtn = container.querySelector('#chat-send') as HTMLButtonElement;
    input.value = 'Hello';
    sendBtn.click();

    await vi.waitFor(() => {
      expect(container.querySelectorAll('#chat-messages .chat-message')).toHaveLength(2);
    });

    const newChatBtn = container.querySelector('#chat-new') as HTMLButtonElement;
    newChatBtn.click();

    expect(container.querySelectorAll('#chat-messages .chat-message')).toHaveLength(0);

    await sendMessage('Fresh start', vi.fn());
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody.messages).toEqual([{ role: 'user', content: 'Fresh start' }]);
  });

  it('calls onOpen when the pill is clicked', () => {
    const container = document.createElement('div');
    const onOpen = vi.fn();
    initialize(container, onOpen);
    const pill = container.querySelector('#chat-pill') as HTMLButtonElement;

    pill.click();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('shows a typing indicator while waiting for the first response chunk, then replaces it with the reply', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      makeStreamingResponse(['{"content":"Hi there!"}\n'])
    );
    vi.stubGlobal('fetch', fetchMock);

    const container = document.createElement('div');
    initialize(container);
    (container.querySelector('#chat-pill') as HTMLButtonElement).click();

    const input = container.querySelector('#chat-input') as HTMLInputElement;
    const sendBtn = container.querySelector('#chat-send') as HTMLButtonElement;
    input.value = 'Hello';
    sendBtn.click();

    expect(container.querySelector('.chat-message--typing')).not.toBeNull();

    await vi.waitFor(() => {
      expect(container.querySelector('.chat-message--typing')).toBeNull();
    });

    const messages = container.querySelectorAll('#chat-messages .chat-message');
    expect(messages).toHaveLength(2);
    expect(messages[1].textContent).toBe('Hi there!');
  });

  it('removes the typing indicator without leaving a bubble when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network error')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    document.body.innerHTML = '<div id="error-banner" hidden></div>';

    const container = document.createElement('div');
    initialize(container);
    (container.querySelector('#chat-pill') as HTMLButtonElement).click();

    const input = container.querySelector('#chat-input') as HTMLInputElement;
    const sendBtn = container.querySelector('#chat-send') as HTMLButtonElement;
    input.value = 'Hello';
    sendBtn.click();

    expect(container.querySelector('.chat-message--typing')).not.toBeNull();

    await vi.waitFor(() => {
      expect(sendBtn.disabled).toBe(false);
    });

    expect(container.querySelector('.chat-message--typing')).toBeNull();
    expect(container.querySelectorAll('#chat-messages .chat-message')).toHaveLength(1);
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
