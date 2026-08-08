import { Router } from 'express';

export const chatRouter = Router();

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function isValidMessage(message: unknown): message is ChatMessage {
  if (typeof message !== 'object' || message === null) return false;
  const { role, content } = message as Record<string, unknown>;
  return (role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim().length > 0;
}

chatRouter.post('/', async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }
  if (!messages.every(isValidMessage)) {
    res.status(400).json({ error: 'each message must have a role of "user" or "assistant" and non-empty content' });
    return;
  }

  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: true }),
    });
  } catch {
    res.status(502).json({ error: 'Ollama request failed' });
    return;
  }

  if (!ollamaRes.ok || !ollamaRes.body) {
    res.status(502).json({ error: 'Ollama returned an error' });
    return;
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');

  const reader = ollamaRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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

        let parsed: { message?: { content?: unknown }; done?: unknown };
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          continue;
        }

        const content = parsed?.message?.content;
        if (typeof content === 'string' && content.length > 0) {
          res.write(`${JSON.stringify({ content })}\n`);
        }
      }
    }
  } catch {
    // Connection to Ollama dropped mid-stream; end the response as-is so the
    // client can detect the incomplete stream.
  }

  res.end();
});
