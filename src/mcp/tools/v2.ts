import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DEFAULT_ZOOM, goToPlace } from '../navigation.js';
import { DEFAULT_LIST_LIMIT, listUncategorizedArticles, setArticleCategory } from '../categorization.js';
import { filterMap } from '../mapFilter.js';
import { listMaps } from '../../lib/mapEvents.js';

// Map view tools change exactly one map, named by the id its tab shows. They
// never pick a map themselves — the user (or list_maps, shown to the user) says which.
const mapIdParam = z
  .string()
  .min(1)
  .describe("Id of the map to change, shown on the map in the user's browser (e.g. \"k3f9xq\"). Ask the user if you don't know it.");

// v2 contract — breaking changes from v1:
//   - input param renamed `place` → `query`
//   - new optional `zoom`
//   - returns structuredContent (validated against outputSchema) alongside text
// Additive since: list_uncategorized_articles, set_article_category, filter_map, list_maps.
export function registerV2Tools(server: McpServer): void {
  server.registerTool(
    'go_to_place',
    {
      title: 'Go to place',
      description:
        'Move the OurGaia map to a named place (city, landmark, or address). ' +
        'Use when the user asks to go to, show, fly to, or look at somewhere.',
      inputSchema: {
        mapId: mapIdParam,
        query: z.string().min(1).describe('Name or address of the place, e.g. "Eiffel Tower" or "Kyoto"'),
        zoom: z
          .number()
          .min(1)
          .max(18)
          .optional()
          .describe(`Map zoom level: ~4 country, ~10 city, ~14 neighborhood (default), ~17 street`),
      },
      outputSchema: {
        lat: z.number(),
        lng: z.number(),
        zoom: z.number(),
        displayName: z.string(),
      },
    },
    async ({ mapId, query, zoom }) => {
      const result = await goToPlace(mapId, query, zoom ?? DEFAULT_ZOOM);
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const { lat, lng, displayName } = result;
      const structuredContent = { lat, lng, zoom: result.zoom, displayName };
      return {
        content: [{ type: 'text', text: `Moved map to ${displayName} (${lat.toFixed(4)}, ${lng.toFixed(4)}) at zoom ${result.zoom}.` }],
        structuredContent,
      };
    }
  );

  server.registerTool(
    'filter_map',
    {
      title: 'Filter map',
      description:
        'Choose which categories of landmarks the OurGaia map shows. ' +
        'Use when the user asks to show only, hide, show again, or show all kinds of places, ' +
        'e.g. "only show museums", "hide parks", "show everything".',
      inputSchema: {
        mapId: mapIdParam,
        mode: z
          .enum(['only', 'show', 'hide', 'all'])
          .describe('"only": show just these categories; "show"/"hide": add or remove these; "all": show every category'),
        categories: z
          .array(z.string().min(1))
          .optional()
          .describe('Category names or ids, e.g. ["museum", "park"]. Not needed for mode "all".'),
      },
      outputSchema: {
        mode: z.enum(['only', 'show', 'hide', 'all']),
        categories: z.array(z.object({ id: z.string(), label: z.string() })),
      },
    },
    async ({ mapId, mode, categories }) => {
      const result = filterMap(mapId, mode, categories);
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const labels = result.categories.map((c) => c.label).join(', ');
      const text = {
        only: `Showing only ${labels}.`,
        show: `Now also showing ${labels}.`,
        hide: `Hid ${labels}.`,
        all: 'Showing all categories.',
      }[mode];
      return {
        content: [{ type: 'text', text }],
        structuredContent: { mode: result.mode, categories: result.categories },
      };
    }
  );

  server.registerTool(
    'list_maps',
    {
      title: 'List open maps',
      description:
        'List the OurGaia maps open in browser tabs, with each map id and its last reported center, zoom and ' +
        'hidden categories. Use it to show the user which maps are open so they can say which one to change — ' +
        'do not choose a map on their behalf.',
      inputSchema: {},
      outputSchema: {
        maps: z.array(
          z.object({
            mapId: z.string(),
            connectedAt: z.string(),
            view: z
              .object({ lat: z.number(), lng: z.number(), zoom: z.number(), hiddenCategories: z.array(z.string()) })
              .optional(),
          })
        ),
      },
    },
    async () => {
      const maps = listMaps();
      const text =
        maps.length === 0
          ? 'No OurGaia map is open. Open the app in a browser first.'
          : maps
              .map(({ mapId, view }) =>
                view
                  ? `${mapId}: centered on ${view.lat.toFixed(4)}, ${view.lng.toFixed(4)} at zoom ${view.zoom.toFixed(1)}` +
                    (view.hiddenCategories.length > 0 ? `, hiding ${view.hiddenCategories.join(', ')}` : '')
                  : `${mapId}: no view reported yet`
              )
              .join('\n');
      return { content: [{ type: 'text', text }], structuredContent: { maps } };
    }
  );

  server.registerTool(
    'list_uncategorized_articles',
    {
      title: 'List uncategorized articles',
      description:
        'List Wikipedia articles the keyword classifier could not categorize (shown as "?" on the map), ' +
        'most recently seen first, with their intro text and raw Wikipedia categories. ' +
        'Also returns the valid category ids to choose from with set_article_category.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe(`Maximum number of articles to return (default ${DEFAULT_LIST_LIMIT})`),
      },
      outputSchema: {
        articles: z.array(
          z.object({
            pageId: z.number(),
            title: z.string(),
            lat: z.number(),
            lng: z.number(),
            extract: z.string(),
            rawCategories: z.array(z.string()),
          })
        ),
        categories: z.array(z.object({ id: z.string(), label: z.string() })),
      },
    },
    async ({ limit }) => {
      const result = await listUncategorizedArticles(limit ?? DEFAULT_LIST_LIMIT);
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const { articles, categories } = result;
      return {
        content: [{ type: 'text', text: JSON.stringify({ articles, categories }) }],
        structuredContent: { articles, categories },
      };
    }
  );

  server.registerTool(
    'set_article_category',
    {
      title: 'Set article category',
      description:
        "Set a Wikipedia article's map category, overriding the keyword classifier. " +
        'Use a category id from list_uncategorized_articles. Categories a person set by hand are never replaced.',
      inputSchema: {
        pageId: z.number().int().positive().describe('Wikipedia page id of the article'),
        category: z.string().min(1).describe('Category id, e.g. "museum" or "park"'),
      },
      outputSchema: {
        pageId: z.number(),
        category: z.string(),
      },
    },
    async ({ pageId, category }) => {
      const result = await setArticleCategory(pageId, category);
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      return {
        content: [{ type: 'text', text: `Set article ${pageId} to category "${category}".` }],
        structuredContent: { pageId: result.pageId, category: result.category },
      };
    }
  );
}
