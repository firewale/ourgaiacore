// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

let redisReady = true;
const mockQuery = vi.fn();

vi.mock('../../lib/redisClient.js', () => ({ isRedisReady: () => redisReady }));
vi.mock('../../lib/dbClient.js', () => ({ getDbClient: () => ({ query: mockQuery }) }));

const { healthRouter } = await import('../health.js');

function makeApp() {
  const app = express();
  app.use('/', healthRouter);
  return app;
}

function tagsResponse(names: string[]) {
  return { ok: true, json: async () => ({ models: names.map((name) => ({ name })) }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  redisReady = true;
  mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
});

describe('GET /api/health', () => {
  it('reports every dependency as up when they are', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tagsResponse(['llama3.2:latest', 'nomic-embed-text:latest'])));

    const res = await request(makeApp()).get('/');

    expect(res.status).toBe(200);
    expect(Date.parse(res.body.startedAt)).not.toBeNaN();
    expect(res.body).toMatchObject({
      redis: true,
      postgres: true,
      ollama: { reachable: true, model: 'llama3.2', modelInstalled: true, embedModel: 'nomic-embed-text', embedModelInstalled: true },
    });
  });

  it('reports a missing chat model while Ollama is reachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(tagsResponse(['nomic-embed-text:latest'])));

    const res = await request(makeApp()).get('/');

    expect(res.body.ollama).toMatchObject({ reachable: true, modelInstalled: false, embedModelInstalled: true });
  });

  it('still responds 200 when every dependency is down', async () => {
    redisReady = false;
    mockQuery.mockRejectedValue(new Error('connection refused'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const res = await request(makeApp()).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ redis: false, postgres: false, ollama: { reachable: false, modelInstalled: false } });
  });
});
