// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../lib/rag.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/rag.js')>('../../lib/rag.js');
  return { ...actual, selectRelevantContext: vi.fn() };
});

vi.mock('../../mcp/navigation.js', () => ({ DEFAULT_ZOOM: 14, goToPlace: vi.fn() }));
// Only 'k3f9xq' is an open map, as if its tab were connected.
vi.mock('../../lib/mapEvents.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/mapEvents.js')>('../../lib/mapEvents.js');
  return { ...actual, isMapOpen: (mapId: string) => mapId === 'k3f9xq' };
});

const { chatRouter } = await import('../chat.js');
const { selectRelevantContext } = await import('../../lib/rag.js');
const selectRelevantContextMock = vi.mocked(selectRelevantContext);
const { goToPlace } = await import('../../mcp/navigation.js');
const goToPlaceMock = vi.mocked(goToPlace);

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
    expect(requestBody).toMatchObject({
      model: 'llama3.2',
      messages: [{ role: 'system' }, { role: 'user', content: 'Hi' }],
      stream: true,
    });
  });

  it('offers the MCP v2 tools to Ollama in its function-calling format', async () => {
    const body = makeStreamingBody(['{"message":{"content":"Hi."},"done":true}\n']);
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, body });
    vi.stubGlobal('fetch', fetchMock);

    await request(makeApp())
      .post('/')
      .send({ messages: [{ role: 'user', content: 'Take me to Kyoto' }], mapId: 'k3f9xq' });

    const { tools } = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    // Map view tools only — the categorization tools are kept away from the chat model.
    expect(tools.map((t: { function: { name: string } }) => t.function.name)).toEqual(['go_to_place', 'filter_map']);
    expect(tools[0].type).toBe('function');
    expect(tools[0].function.name).toBe('go_to_place');
    // mapId is filled in from the request, so the model never sees it.
    expect(tools[0].function.parameters.required).toEqual(['query']);
    expect(Object.keys(tools[0].function.parameters.properties)).toEqual(['query', 'zoom']);
    expect(tools[1].function.parameters.required).toEqual(['mode']);
  });

  it('does not offer tools when the request has no map id', async () => {
    const body = makeStreamingBody(['{"message":{"content":"Hi."},"done":true}\n']);
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, body });
    vi.stubGlobal('fetch', fetchMock);

    await request(makeApp()).post('/').send({ messages: [{ role: 'user', content: 'Take me to Kyoto' }] });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).tools).toBeUndefined();
  });

  it('does not offer tools when the message is not a map request', async () => {
    const body = makeStreamingBody(['{"message":{"content":"I can move the map."},"done":true}\n']);
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, body });
    vi.stubGlobal('fetch', fetchMock);

    await request(makeApp())
      .post('/')
      .send({ messages: [{ role: 'user', content: 'What tools do you have available?' }], mapId: 'k3f9xq' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).tools).toBeUndefined();
  });

  it('does not offer tools for a map id no tab has open', async () => {
    const body = makeStreamingBody(['{"message":{"content":"I can\'t reach the map."},"done":true}\n']);
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, body });
    vi.stubGlobal('fetch', fetchMock);

    await request(makeApp())
      .post('/')
      .send({ messages: [{ role: 'user', content: 'Take me to Kyoto' }], mapId: 'stale1' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).tools).toBeUndefined();
  });

  it('always prepends a system message describing when to use tools', async () => {
    const body = makeStreamingBody(['{"message":{"content":"Hi."},"done":true}\n']);
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, body });
    vi.stubGlobal('fetch', fetchMock);

    await request(makeApp()).post('/').send({ messages: [{ role: 'user', content: 'Hi' }] });

    const { messages } = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('only do so when the user asks');
  });

  it('runs a tool call through MCP, then streams the follow-up answer', async () => {
    goToPlaceMock.mockResolvedValueOnce({ ok: true, lat: 35.0116, lng: 135.7681, zoom: 10, displayName: 'Kyoto, Japan' });
    const toolCallBody = makeStreamingBody([
      '{"message":{"content":"","tool_calls":[{"function":{"name":"go_to_place","arguments":{"query":"Kyoto","zoom":10}}}]},"done":false}\n',
      '{"message":{"content":""},"done":true}\n',
    ]);
    const answerBody = makeStreamingBody(['{"message":{"content":"Here is Kyoto!"},"done":true}\n']);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, body: toolCallBody })
      .mockResolvedValueOnce({ ok: true, body: answerBody });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp())
      .post('/')
      .send({ messages: [{ role: 'user', content: 'Show me Kyoto' }], mapId: 'k3f9xq' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('{"content":"Here is Kyoto!"}\n');
    // The tool acts on the map of the tab the chat was sent from.
    expect(goToPlaceMock).toHaveBeenCalledWith('k3f9xq', 'Kyoto', 10);

    const followUp = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(followUp.messages).toHaveLength(4);
    expect(followUp.messages[2]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [{ function: { name: 'go_to_place', arguments: { query: 'Kyoto', zoom: 10 } } }],
    });
    expect(followUp.messages[3].role).toBe('tool');
    expect(followUp.messages[3].tool_name).toBe('go_to_place');
    expect(followUp.messages[3].content).toContain('Moved map to Kyoto, Japan');
  });

  it('keeps text the model streamed before its tool call in the follow-up history', async () => {
    goToPlaceMock.mockResolvedValueOnce({ ok: true, lat: 35.0116, lng: 135.7681, zoom: 10, displayName: 'Kyoto, Japan' });
    const toolCallBody = makeStreamingBody([
      '{"message":{"content":"Flying you to Kyoto."},"done":false}\n',
      '{"message":{"content":"","tool_calls":[{"function":{"name":"go_to_place","arguments":{"query":"Kyoto"}}}]},"done":true}\n',
    ]);
    const answerBody = makeStreamingBody(['{"message":{"content":" Here it is!"},"done":true}\n']);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, body: toolCallBody })
      .mockResolvedValueOnce({ ok: true, body: answerBody });
    vi.stubGlobal('fetch', fetchMock);

    await request(makeApp()).post('/').send({ messages: [{ role: 'user', content: 'Show me Kyoto' }], mapId: 'k3f9xq' });

    const followUp = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(followUp.messages[2].content).toBe('Flying you to Kyoto.');
  });

  it('passes a tool error back to the model so it can explain it', async () => {
    goToPlaceMock.mockResolvedValueOnce({ ok: false, error: 'No place found matching "Atlantis".' });
    const toolCallBody = makeStreamingBody([
      '{"message":{"content":"","tool_calls":[{"function":{"name":"go_to_place","arguments":{"query":"Atlantis"}}}]},"done":true}\n',
    ]);
    const answerBody = makeStreamingBody(['{"message":{"content":"I could not find that."},"done":true}\n']);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, body: toolCallBody })
      .mockResolvedValueOnce({ ok: true, body: answerBody });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(makeApp())
      .post('/')
      .send({ messages: [{ role: 'user', content: 'Go to Atlantis' }], mapId: 'k3f9xq' });

    expect(res.text).toBe('{"content":"I could not find that."}\n');
    const followUp = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(followUp.messages[3].content).toBe('No place found matching "Atlantis".');
  });

  it('stops offering tools after the max number of tool rounds', async () => {
    goToPlaceMock.mockResolvedValue({ ok: true, lat: 0, lng: 0, zoom: 14, displayName: 'Somewhere' });
    const toolCallLine = '{"message":{"content":"","tool_calls":[{"function":{"name":"go_to_place","arguments":{"query":"x"}}}]},"done":true}\n';
    const fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, body: makeStreamingBody([toolCallLine]) }));
    vi.stubGlobal('fetch', fetchMock);

    await request(makeApp())
      .post('/')
      .send({ messages: [{ role: 'user', content: 'Go somewhere, forever' }], mapId: 'k3f9xq' });

    // 3 rounds with tools offered, then one final call without them.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(fetchMock.mock.calls[3][1].body as string).tools).toBeUndefined();
    goToPlaceMock.mockReset();
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

  it('sends only the base system message when no candidate clears the relevance threshold', async () => {
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
    expect(requestBody.messages).toHaveLength(2);
    expect(requestBody.messages[0].role).toBe('system');
    expect(requestBody.messages[0].content).not.toContain('City Museum');
    expect(requestBody.messages[1]).toEqual({ role: 'user', content: 'Unrelated question' });
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
