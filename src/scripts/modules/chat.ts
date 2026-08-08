import { showBanner } from './banner.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ChatSendStatus = 'ok' | 'error';

const apiUrl = '/api/chat';
const history: ChatMessage[] = [];

export function clearHistory(): void {
  history.length = 0;
}

export async function sendMessage(
  content: string,
  onUpdate: (fullText: string) => void
): Promise<ChatSendStatus> {
  history.push({ role: 'user', content });

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
  } catch (err) {
    console.error('Chat API request failed:', err);
    return 'error';
  }

  if (!res.ok || !res.body) {
    console.error('Chat API error:', res.status);
    return 'error';
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed: { content?: unknown };
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          continue;
        }

        if (typeof parsed.content === 'string') {
          fullText += parsed.content;
          onUpdate(fullText);
        }
      }
    }
  } catch (err) {
    console.error('Chat stream read error:', err);
    return 'error';
  }

  if (!fullText) {
    console.error('Chat API returned an empty response');
    return 'error';
  }

  history.push({ role: 'assistant', content: fullText });
  return 'ok';
}

function appendMessageBubble(list: HTMLElement, role: ChatMessage['role'], content: string): HTMLElement {
  const bubble = document.createElement('div');
  bubble.className = `chat-message chat-message--${role}`;
  bubble.textContent = content;
  list.appendChild(bubble);
  list.scrollTop = list.scrollHeight;
  return bubble;
}

let pillRef: HTMLButtonElement | null = null;
let winRef: HTMLElement | null = null;

export function collapseChat(): void {
  if (!pillRef || !winRef) return;
  winRef.hidden = true;
  pillRef.hidden = false;
}

export function initialize(container: HTMLElement, onOpen?: () => void): void {
  const pill = document.createElement('button');
  pill.id = 'chat-pill';
  pill.textContent = 'Chat ▲';
  pill.title = 'Open chat';

  const win = document.createElement('div');
  win.id = 'chat-window';
  win.hidden = true;

  const header = document.createElement('div');
  header.id = 'chat-header';

  const title = document.createElement('span');
  title.id = 'chat-header-title';
  title.textContent = 'Chat';

  const minimizeBtn = document.createElement('button');
  minimizeBtn.id = 'chat-minimize';
  minimizeBtn.textContent = '▼';
  minimizeBtn.title = 'Minimize chat';

  header.appendChild(title);
  header.appendChild(minimizeBtn);
  win.appendChild(header);

  const messageList = document.createElement('div');
  messageList.id = 'chat-messages';
  win.appendChild(messageList);

  const inputRow = document.createElement('div');
  inputRow.className = 'chat-input-row';

  const input = document.createElement('input');
  input.id = 'chat-input';
  input.type = 'text';
  input.placeholder = 'Ask something...';

  const sendBtn = document.createElement('button');
  sendBtn.id = 'chat-send';
  sendBtn.textContent = 'Send';

  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  win.appendChild(inputRow);

  pill.addEventListener('click', () => {
    pill.hidden = true;
    win.hidden = false;
    onOpen?.();
  });

  minimizeBtn.addEventListener('click', () => {
    win.hidden = true;
    pill.hidden = false;
  });

  async function send(): Promise<void> {
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    sendBtn.disabled = true;
    appendMessageBubble(messageList, 'user', text);

    let assistantBubble: HTMLElement | null = null;

    try {
      const status = await sendMessage(text, (fullText) => {
        if (!assistantBubble) {
          assistantBubble = appendMessageBubble(messageList, 'assistant', fullText);
        } else {
          assistantBubble.textContent = fullText;
          messageList.scrollTop = messageList.scrollHeight;
        }
      });
      if (status === 'error') {
        showBanner('Chat is unavailable — check that Ollama is running.');
      }
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener('click', () => {
    void send();
  });

  input.addEventListener('keypress', (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    void send();
  });

  container.appendChild(pill);
  container.appendChild(win);

  pillRef = pill;
  winRef = win;
}
