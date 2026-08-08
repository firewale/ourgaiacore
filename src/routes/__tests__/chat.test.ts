// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../lib/rag.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/rag.js')>('../../lib/rag.js');
  return { ...actual, selectRelevantContext: vi.fn() };
});

const { chatRouter } = await import('../chat.js');
const { selectRelevantContext } = await import('../../lib/rag.js');
const selectRelevantContextMock = vi.mocked(selectRelevantContext);

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

  it('prepends a system message built from the relevant candidates when RAG context is found', async () => {
    selectRelevantContextMock.mockResolvedValueOnce([
      { pageId: 1, title: 'City Museum', extract: '<p>A museum of local history.</p>', category: 'museum' },
    ]);
    const body = makeStreamingBody(['{"message":{"content":"It\'s a museum."},"done":true}\n']);
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, body });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp())
      .post('/')
      .send({
        messages: [{ role: 'user', content: 'Tell me about the museum' }],
        candidates: [{ pageId: 1, title: 'City Museum', extract: '<p>A museum of local history.</p>', category: 'museum' }],
      });

    expect(res.status).toBe(200);
    expect(selectRelevantContextMock).toHaveBeenCalledWith('Tell me about the museum', [
      { pageId: 1, title: 'City Museum', extract: '<p>A museum of local history.</p>', category: 'museum' },
    ]);

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody.messages).toHaveLength(2);
    expect(requestBody.messages[0].role).toBe('system');
    expect(requestBody.messages[0].content).toContain('City Museum');
    expect(requestBody.messages[1]).toEqual({ role: 'user', content: 'Tell me about the museum' });
  });

  it('sends messages unchanged when no candidate clears the relevance threshold', async () => {
    selectRelevantContextMock.mockResolvedValueOnce(null);
    const body = makeStreamingBody(['{"message":{"content":"Sure."},"done":true}\n']);
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, body });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp())
      .post('/')
      .send({
        messages: [{ role: 'user', content: 'Unrelated question' }],
        candidates: [{ pageId: 1, title: 'City Museum', category: 'museum' }],
      });

    expect(res.status).toBe(200);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody.messages).toEqual([{ role: 'user', content: 'Unrelated question' }]);
  });

  it('does not attempt retrieval when candidates is omitted', async () => {
    const body = makeStreamingBody(['{"message":{"content":"Hi."},"done":true}\n']);
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, body });
    vi.stubGlobal('fetch', fetchMock);

    await request(makeApp())
      .post('/')
      .send({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(selectRelevantContextMock).not.toHaveBeenCalled();
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
