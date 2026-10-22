import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { goToPlace } from '../navigation.js';

// v1 contract (deprecated — kept so existing clients keep working):
//   go_to_place({ mapId, place }) → text only, always DEFAULT_ZOOM.
// v2 renamed `place` → `query`, added `zoom`, and added structured output.
export function registerV1Tools(server: McpServer): void {
  server.registerTool(
    'go_to_place',
    {
      title: 'Go to place',
      description:
        'Move the OurGaia map to a named place (city, landmark, or address). ' +
        'Deprecated: use /mcp/v2, which also accepts a zoom level and returns coordinates.',
      inputSchema: {
        mapId: z.string().min(1).describe("Id of the map to move, shown on the map in the user's browser"),
        place: z.string().min(1).describe('Name or address of the place, e.g. "Eiffel Tower" or "Kyoto"'),
      },
    },
    async ({ mapId, place }) => {
      console.warn('[mcp/v1] go_to_place called on deprecated v1 endpoint');
      const result = await goToPlace(mapId, place);
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      return { content: [{ type: 'text', text: `Moved map to ${result.displayName}.` }] };
    }
  );
}
