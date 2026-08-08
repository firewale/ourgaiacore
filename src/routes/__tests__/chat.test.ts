// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { chatRouter } = await import('../chat.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/', chatRouter);
  return app;
}

function makeStreamingBody(lines: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/chat', () => {
  it('returns 400 when messages is missing', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await request(makeApp()).post('/').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when messages is an empty array', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await request(makeApp()).post('/').send({ messages: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when a message has an invalid role', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await request(makeApp())
      .post('/')
      .send({ messages: [{ role: 'system', content: 'hi' }] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when a message has empty content', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await request(makeApp())
      .post('/')
      .send({ messages: [{ role: 'user', content: '   ' }] });
    expect(res.status).toBe(400);
  });

  it('calls Ollama with stream: true and streams ndjson content chunks back', async () => {
    const body = makeStreamingBody([
      '{"message":{"content":"Hel"},"done":false}\n',
      '{"message":{"content":"lo!"},"done":false}\n',
      '{"message":{"content":""},"done":true}\n',
    ]);
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, body });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp())
      .post('/')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    expect(res.text).toBe('{"content":"Hel"}\n{"content":"lo!"}\n');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    const requestBody = JSON.parse(options.body as string);
    expect(requestBody).toEqual({
      model: 'llama3.2',
      messages: [{ role: 'user', content: 'Hi' }],
      stream: true,
    });
  });

  it('handles a chunk boundary that splits a JSON line', async () => {
    const body = makeStreamingBody([
      '{"message":{"content":"Hel',
      'lo"},"done":false}\n{"message":{"content":""},"done":true}\n',
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, body }));

    const res = await request(makeApp())
      .post('/')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.status).toBe(200);
    expect(res.text).toBe('{"content":"Hello"}\n');
  });

  it('returns 502 when the Ollama request throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('connection refused')));
    const res = await request(makeApp())
      .post('/')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });
    expect(res.status).toBe(502);
  });

  it('returns 502 when Ollama responds with a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false }));
    const res = await request(makeApp())
      .post('/')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });
    expect(res.status).toBe(502);
  });

  it('returns 502 when Ollama responds without a body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, body: null }));
    const res = await request(makeApp())
      .post('/')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });
    expect(res.status).toBe(502);
  });
});
