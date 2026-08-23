// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DEFAULT_CATEGORIES } from '../../lib/defaultCategories.js';

const mockQuery = vi.fn();

vi.mock('../../lib/dbClient.js', () => ({
  getDbClient: () => ({ query: mockQuery }),
}));

// Import after mock setup
const { categoriesRouter } = await import('../categories.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/', categoriesRouter);
  return app;
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('GET /api/categories', () => {
  it('returns the built-in categories when nothing has been loaded from Postgres', async () => {
    const res = await request(makeApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(res.body.find((c: { id: string }) => c.id === 'museum')).toMatchObject({ label: 'Museum', glyph: '🏛' });
  });
});

describe('POST /api/categories', () => {
  it('returns 400 when label is missing', async () => {
    const res = await request(makeApp()).post('/').send({ glyph: '☕' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when glyph is missing', async () => {
    const res = await request(makeApp()).post('/').send({ label: 'Coffee Shop' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when label is too long', async () => {
    const res = await request(makeApp()).post('/').send({ label: 'x'.repeat(41), glyph: '☕' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when glyph is too long', async () => {
    const res = await request(makeApp()).post('/').send({ label: 'Coffee Shop', glyph: 'notanemoji' });
    expect(res.status).toBe(400);
  });

  it('creates a category with a slugified id and a palette color', async () => {
    mockQuery
      .mockResolvedValueOnce({}) // CREATE TABLE IF NOT EXISTS
      .mockResolvedValueOnce({ rows: [{ max: 29 }] }) // SELECT MAX(priority)
      .mockResolvedValueOnce({}); // INSERT

    const res = await request(makeApp()).post('/').send({ label: 'Coffee Shop', glyph: '☕' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'coffee-shop', label: 'Coffee Shop', glyph: '☕' });
    expect(typeof res.body.color).toBe('string');

    const insertCall = mockQuery.mock.calls.find(([sql]) => (sql as string).startsWith('INSERT'));
    expect(insertCall![1]).toEqual(['coffee-shop', 'Coffee Shop', '☕', res.body.color, 30]);
  });

  it('returns 503 when Postgres is unavailable', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    const res = await request(makeApp()).post('/').send({ label: 'Coffee Shop', glyph: '☕' });
    expect(res.status).toBe(503);
  });
});

describe('PATCH /api/categories/:id', () => {
  it('returns 400 when neither label nor glyph is provided', async () => {
    const res = await request(makeApp()).patch('/museum').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when the provided label is too long', async () => {
    const res = await request(makeApp()).patch('/museum').send({ label: 'x'.repeat(41) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when the provided glyph is too long', async () => {
    const res = await request(makeApp()).patch('/museum').send({ glyph: 'notanemoji' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown category id', async () => {
    const res = await request(makeApp()).patch('/not-a-real-category').send({ label: 'New Name' });
    expect(res.status).toBe(404);
  });

  it('updates label and glyph, leaving id and color unchanged', async () => {
    mockQuery
      .mockResolvedValueOnce({}) // CREATE TABLE IF NOT EXISTS
      .mockResolvedValueOnce({}); // UPDATE

    const res = await request(makeApp()).patch('/museum').send({ label: 'Art Museum', glyph: '🖼' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'museum', label: 'Art Museum', glyph: '🖼', color: '#9C27B0' });

    const updateCall = mockQuery.mock.calls.find(([sql]) => (sql as string).startsWith('UPDATE'));
    expect(updateCall![1]).toEqual(['Art Museum', '🖼', 'museum']);
  });

  it('leaves the omitted field unchanged when only one of label/glyph is provided', async () => {
    mockQuery.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const res = await request(makeApp()).patch('/park').send({ glyph: '🌲' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'park', label: 'Park', glyph: '🌲' });
  });

  it('returns 503 when Postgres is unavailable', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    const res = await request(makeApp()).patch('/museum').send({ label: 'Art Museum' });
    expect(res.status).toBe(503);
  });
});
