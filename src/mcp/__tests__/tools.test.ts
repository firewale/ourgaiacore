// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('../../lib/geocode.js', () => ({ searchPlaces: vi.fn() }));
vi.mock('../../lib/uncategorizedArticles.js', () => ({ listUncategorized: vi.fn(), removeUncategorized: vi.fn() }));
vi.mock('../../lib/articleCategoryOverrides.js', () => ({ setCategoryOverride: vi.fn() }));

const { createMcpServer } = await import('../createServer.js');
const { searchPlaces } = await import('../../lib/geocode.js');
const mapEvents = await import('../../lib/mapEvents.js');
const searchPlacesMock = vi.mocked(searchPlaces);
const { listUncategorized, removeUncategorized } = await import('../../lib/uncategorizedArticles.js');
const listUncategorizedMock = vi.mocked(listUncategorized);
const removeUncategorizedMock = vi.mocked(removeUncategorized);
const { setCategoryOverride } = await import('../../lib/articleCategoryOverrides.js');
const setCategoryOverrideMock = vi.mocked(setCategoryOverride);

const KYOTO = { lat: 35.0116, lon: 135.7681, displayName: 'Kyoto, Japan' };

async function connect(version: 'v1' | 'v2'): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer(version).connect(serverTransport);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientTransport);
  return client;
}

function openMapTab(): { mapId: string; write: ReturnType<typeof vi.fn> } {
  const write = vi.fn();
  const { mapId } = mapEvents.subscribe({ write } as unknown as Response);
  return { mapId, write };
}

function sentEvent(tab: { write: ReturnType<typeof vi.fn> }): unknown {
  const frame = tab.write.mock.calls[0][0] as string;
  return JSON.parse(frame.split('data: ')[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mapEvents._resetMapEventsForTests();
  searchPlacesMock.mockResolvedValue({ status: 'ok', results: [KYOTO] });
});

describe('tool contracts per version', () => {
  it('v1 go_to_place takes `mapId` + `place` and has no output schema', async () => {
    const { tools } = await (await connect('v1')).listTools();
    expect(tools.map((t) => t.name)).toEqual(['go_to_place']);
    expect(tools[0].inputSchema.required).toEqual(['mapId', 'place']);
    expect(Object.keys(tools[0].inputSchema.properties ?? {})).toEqual(['mapId', 'place']);
    expect(tools[0].outputSchema).toBeUndefined();
    expect(tools[0].description).toContain('Deprecated');
  });

  it('v2 go_to_place takes `mapId` + `query` + optional `zoom` and declares an output schema', async () => {
    const { tools } = await (await connect('v2')).listTools();
    expect(tools[0].inputSchema.required).toEqual(['mapId', 'query']);
    expect(Object.keys(tools[0].inputSchema.properties ?? {})).toEqual(['mapId', 'query', 'zoom']);
    expect(tools[0].outputSchema?.required).toEqual(['lat', 'lng', 'zoom', 'displayName']);
  });

  it('v2 map view tools all require a mapId', async () => {
    const { tools } = await (await connect('v2')).listTools();
    for (const name of ['go_to_place', 'filter_map']) {
      expect(tools.find((t) => t.name === name)?.inputSchema.required).toContain('mapId');
    }
  });

  it('a v2-shaped call against v1 fails validation (the breaking change)', async () => {
    const { mapId } = openMapTab();
    const result = await (await connect('v1')).callTool({ name: 'go_to_place', arguments: { mapId, query: 'Kyoto' } });
    expect(result.isError).toBe(true);
    expect(searchPlacesMock).not.toHaveBeenCalled();
  });
});

describe('go_to_place', () => {
  it('v1 navigates the named map at the default zoom and returns text only', async () => {
    const tab = openMapTab();
    const result = await (await connect('v1')).callTool({ name: 'go_to_place', arguments: { mapId: tab.mapId, place: 'Kyoto' } });

    expect(searchPlacesMock).toHaveBeenCalledWith('Kyoto');
    expect(sentEvent(tab)).toEqual({ type: 'navigate', lat: 35.0116, lng: 135.7681, zoom: 14, displayName: 'Kyoto, Japan' });
    expect(result.content).toEqual([{ type: 'text', text: 'Moved map to Kyoto, Japan.' }]);
    expect(result.structuredContent).toBeUndefined();
  });

  it('v2 honors zoom and returns structured content', async () => {
    const tab = openMapTab();
    const result = await (await connect('v2')).callTool({
      name: 'go_to_place',
      arguments: { mapId: tab.mapId, query: 'Kyoto', zoom: 10 },
    });

    expect(sentEvent(tab)).toMatchObject({ zoom: 10 });
    expect(result.structuredContent).toEqual({ lat: 35.0116, lng: 135.7681, zoom: 10, displayName: 'Kyoto, Japan' });
  });

  it('moves only the named map, never other open tabs', async () => {
    const target = openMapTab();
    const other = openMapTab();
    await (await connect('v2')).callTool({ name: 'go_to_place', arguments: { mapId: target.mapId, query: 'Kyoto' } });

    expect(target.write).toHaveBeenCalledTimes(1);
    expect(other.write).not.toHaveBeenCalled();
  });

  it('v2 rejects an out-of-range zoom', async () => {
    const { mapId } = openMapTab();
    const result = await (await connect('v2')).callTool({ name: 'go_to_place', arguments: { mapId, query: 'Kyoto', zoom: 40 } });
    expect(result.isError).toBe(true);
  });

  it('rejects a call without a mapId', async () => {
    openMapTab();
    const result = await (await connect('v2')).callTool({ name: 'go_to_place', arguments: { query: 'Kyoto' } });
    expect(result.isError).toBe(true);
    expect(searchPlacesMock).not.toHaveBeenCalled();
  });

  it('returns an error when nothing matches', async () => {
    const { mapId } = openMapTab();
    searchPlacesMock.mockResolvedValueOnce({ status: 'ok', results: [] });
    const result = await (await connect('v2')).callTool({ name: 'go_to_place', arguments: { mapId, query: 'Atlantis' } });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'No place found matching "Atlantis".' }]);
  });

  it('returns an error, without geocoding, when no open map has the id', async () => {
    const other = openMapTab();
    const result = await (await connect('v2')).callTool({ name: 'go_to_place', arguments: { mapId: 'zzzzzz', query: 'Kyoto' } });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain('No open OurGaia map has id "zzzzzz"');
    expect(searchPlacesMock).not.toHaveBeenCalled();
    expect(other.write).not.toHaveBeenCalled();
  });

  it('returns an error when the geocoder is rate limited', async () => {
    const { mapId } = openMapTab();
    searchPlacesMock.mockResolvedValueOnce({ status: 'rate-limited' });
    const result = await (await connect('v2')).callTool({ name: 'go_to_place', arguments: { mapId, query: 'Kyoto' } });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain('rate limiting');
  });
});

describe('list_maps', () => {
  it('lists open maps with their last reported view', async () => {
    const a = openMapTab();
    const b = openMapTab();
    mapEvents.updateView(a.mapId, { lat: 35, lng: 135, zoom: 10, hiddenCategories: ['park'] });

    const result = await (await connect('v2')).callTool({ name: 'list_maps', arguments: {} });

    const { maps } = result.structuredContent as { maps: Array<{ mapId: string; view?: unknown }> };
    expect(maps.map((m) => m.mapId)).toEqual([a.mapId, b.mapId]);
    expect(maps[0].view).toEqual({ lat: 35, lng: 135, zoom: 10, hiddenCategories: ['park'] });
    expect((result.content as Array<{ text: string }>)[0].text).toBe(
      `${a.mapId}: centered on 35.0000, 135.0000 at zoom 10.0, hiding park\n${b.mapId}: no view reported yet`
    );
  });

  it('says so when no map is open', async () => {
    const result = await (await connect('v2')).callTool({ name: 'list_maps', arguments: {} });
    expect(result.structuredContent).toEqual({ maps: [] });
    expect((result.content as Array<{ text: string }>)[0].text).toContain('No OurGaia map is open');
  });

  it('is not offered on v1', async () => {
    const { tools } = await (await connect('v1')).listTools();
    expect(tools.map((t) => t.name)).not.toContain('list_maps');
  });
});

describe('list_uncategorized_articles', () => {
  it('returns articles as plain-text excerpts along with the valid category ids', async () => {
    listUncategorizedMock.mockResolvedValueOnce([
      { pageId: 7, title: 'Old Lighthouse', lat: 1, lng: 2, extract: '<p>A <b>lighthouse</b>.</p>', rawCategories: ['Lighthouses in Maine'] },
      { pageId: 8, title: 'Mystery Spot', lat: 3, lng: 4, extract: null, rawCategories: null },
    ]);

    const result = await (await connect('v2')).callTool({ name: 'list_uncategorized_articles', arguments: { limit: 5 } });

    expect(listUncategorizedMock).toHaveBeenCalledWith(5);
    const { articles, categories } = result.structuredContent as {
      articles: unknown[];
      categories: Array<{ id: string }>;
    };
    expect(articles).toEqual([
      { pageId: 7, title: 'Old Lighthouse', lat: 1, lng: 2, extract: 'A lighthouse .', rawCategories: ['Lighthouses in Maine'] },
      { pageId: 8, title: 'Mystery Spot', lat: 3, lng: 4, extract: '', rawCategories: [] },
    ]);
    expect(categories.map((c) => c.id)).toContain('museum');
  });

  it('defaults the limit to 20', async () => {
    listUncategorizedMock.mockResolvedValueOnce([]);
    await (await connect('v2')).callTool({ name: 'list_uncategorized_articles', arguments: {} });
    expect(listUncategorizedMock).toHaveBeenCalledWith(20);
  });

  it('returns an error when the database is unavailable', async () => {
    listUncategorizedMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await (await connect('v2')).callTool({ name: 'list_uncategorized_articles', arguments: {} });
    expect(result.isError).toBe(true);
  });
});

describe('set_article_category', () => {
  it('saves an agent override and removes the article from the uncategorized queue', async () => {
    setCategoryOverrideMock.mockResolvedValueOnce(true);

    const result = await (await connect('v2')).callTool({
      name: 'set_article_category',
      arguments: { pageId: 7, category: 'historic' },
    });

    expect(setCategoryOverrideMock).toHaveBeenCalledWith(7, 'historic', 'agent');
    expect(removeUncategorizedMock).toHaveBeenCalledWith([7]);
    expect(result.structuredContent).toEqual({ pageId: 7, category: 'historic' });
  });

  it('rejects an unknown category id without writing anything', async () => {
    const result = await (await connect('v2')).callTool({
      name: 'set_article_category',
      arguments: { pageId: 7, category: 'lighthouse' },
    });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain('not a valid category id');
    expect(setCategoryOverrideMock).not.toHaveBeenCalled();
  });

  it('refuses to replace a category a person set by hand', async () => {
    setCategoryOverrideMock.mockResolvedValueOnce(false);

    const result = await (await connect('v2')).callTool({
      name: 'set_article_category',
      arguments: { pageId: 7, category: 'historic' },
    });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain('set by a person');
    expect(removeUncategorizedMock).not.toHaveBeenCalled();
  });

  it('is not offered on v1', async () => {
    const { tools } = await (await connect('v1')).listTools();
    expect(tools.map((t) => t.name)).not.toContain('set_article_category');
  });
});

describe('filter_map', () => {
  it('resolves loose category names and sends a filter event to the named map', async () => {
    const tab = openMapTab();
    const result = await (await connect('v2')).callTool({
      name: 'filter_map',
      arguments: { mapId: tab.mapId, mode: 'only', categories: ['Museums', 'food and drink'] },
    });

    expect(sentEvent(tab)).toEqual({ type: 'filter', mode: 'only', categories: ['museum', 'food-and-drink'] });
    expect(result.content).toEqual([{ type: 'text', text: 'Showing only Museum, Food and Drink.' }]);
    expect(result.structuredContent).toEqual({
      mode: 'only',
      categories: [{ id: 'museum', label: 'Museum' }, { id: 'food-and-drink', label: 'Food and Drink' }],
    });
  });

  it('filters only the named map, never other open tabs', async () => {
    const target = openMapTab();
    const other = openMapTab();
    await (await connect('v2')).callTool({ name: 'filter_map', arguments: { mapId: target.mapId, mode: 'all' } });

    expect(target.write).toHaveBeenCalledTimes(1);
    expect(other.write).not.toHaveBeenCalled();
  });

  it('matches a single label word when only one category has it', async () => {
    const tab = openMapTab();
    await (await connect('v2')).callTool({
      name: 'filter_map',
      arguments: { mapId: tab.mapId, mode: 'only', categories: ['food'] },
    });
    expect(sentEvent(tab)).toEqual({ type: 'filter', mode: 'only', categories: ['food-and-drink'] });
  });

  it('maps place-of-worship types like "churches" to the worship category', async () => {
    const tab = openMapTab();
    await (await connect('v2')).callTool({
      name: 'filter_map',
      arguments: { mapId: tab.mapId, mode: 'only', categories: ['museums', 'churches', 'Temple'] },
    });
    expect(sentEvent(tab)).toEqual({ type: 'filter', mode: 'only', categories: ['museum', 'worship'] });
  });

  it('clears the filter with mode "all" and no categories', async () => {
    const tab = openMapTab();
    const result = await (await connect('v2')).callTool({ name: 'filter_map', arguments: { mapId: tab.mapId, mode: 'all' } });

    expect(sentEvent(tab)).toEqual({ type: 'filter', mode: 'all', categories: [] });
    expect(result.isError).toBeFalsy();
  });

  it('rejects unknown categories with the valid ids, without sending anything', async () => {
    const tab = openMapTab();
    const result = await (await connect('v2')).callTool({
      name: 'filter_map',
      arguments: { mapId: tab.mapId, mode: 'hide', categories: ['volcanoes'] },
    });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toMatch(/Unknown category: volcanoes\. Valid ids: .*museum/);
    expect(tab.write).not.toHaveBeenCalled();
  });

  it("doesn't resolve a filler word to the one label containing it", async () => {
    const result = await (await connect('v2')).callTool({
      name: 'filter_map',
      arguments: { mapId: 'zzzzzz', mode: 'only', categories: ['and'] },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain('Unknown category: and');
  });

  it('rejects unknown categories before checking the map id', async () => {
    const result = await (await connect('v2')).callTool({
      name: 'filter_map',
      arguments: { mapId: 'zzzzzz', mode: 'only', categories: ['volcanoes'] },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain('Unknown category: volcanoes');
  });

  it('requires categories for modes other than "all"', async () => {
    const { mapId } = openMapTab();
    const result = await (await connect('v2')).callTool({ name: 'filter_map', arguments: { mapId, mode: 'only' } });
    expect(result.isError).toBe(true);
  });

  it('returns an error when no open map has the id', async () => {
    const other = openMapTab();
    const result = await (await connect('v2')).callTool({ name: 'filter_map', arguments: { mapId: 'zzzzzz', mode: 'all' } });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toContain('No open OurGaia map has id "zzzzzz"');
    expect(other.write).not.toHaveBeenCalled();
  });
});
