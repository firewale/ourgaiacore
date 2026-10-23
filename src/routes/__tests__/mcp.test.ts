// @vitest-environment node
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mcpRouter } from '../mcp.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/mcp', mcpRouter);
  return app;
}

// Streamable HTTP requires clients to accept both JSON and SSE responses.
const MCP_HEADERS = { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' };

// Responses come back as an SSE stream; pull the JSON-RPC payload out of it.
function parseRpc(text: string): { result?: { tools?: Array<{ name: string; inputSchema: { required?: string[] } }>; serverInfo?: { version: string } } } {
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
  return JSON.parse(dataLine!.slice('data: '.length));
}

async function rpc(version: string, method: string, params: Record<string, unknown> = {}) {
  return request(makeApp())
    .post(`/mcp/${version}`)
    .set(MCP_HEADERS)
    .send({ jsonrpc: '2.0', id: 1, method, params });
}

describe('MCP endpoints', () => {
  it.each([
    ['v1', '1.0.0'],
    ['v2', '2.0.0'],
  ])('%s initializes and reports server version %s', async (version, serverVersion) => {
    const res = await rpc(version, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    });
    expect(res.status).toBe(200);
    expect(parseRpc(res.text).result?.serverInfo?.version).toBe(serverVersion);
  });

  it.each([
    ['v1', ['mapId', 'place']],
    ['v2', ['mapId', 'query']],
  ])('%s lists go_to_place with its own required params', async (version, required) => {
    const res = await rpc(version, 'tools/list');
    expect(res.status).toBe(200);
    const tools = parseRpc(res.text).result?.tools ?? [];
    const goToPlace = tools.find((t) => t.name === 'go_to_place');
    expect(goToPlace?.inputSchema.required).toEqual(required);
  });

  it.each([
    ['v1', ['go_to_place']],
    ['v2', ['go_to_place', 'filter_map', 'list_maps', 'list_uncategorized_articles', 'set_article_category']],
  ])('%s exposes exactly its own tool set', async (version, names) => {
    const res = await rpc(version, 'tools/list');
    expect((parseRpc(res.text).result?.tools ?? []).map((t) => t.name)).toEqual(names);
  });

  it('returns 405 for GET in stateless mode', async () => {
    const res = await request(makeApp()).get('/mcp/v2');
    expect(res.status).toBe(405);
  });

  it('returns 404 for an unknown version', async () => {
    const res = await rpc('v3', 'tools/list');
    expect(res.status).toBe(404);
  });
});
