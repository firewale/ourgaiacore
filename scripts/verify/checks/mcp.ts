import { callTool, mcpRequest, result, toolText, type CheckResult } from '../lib.js';

interface ListedTool {
  name: string;
  inputSchema: { required?: string[] };
  outputSchema?: unknown;
}

// The published contract per version. Additive v2 changes extend this list;
// anything else here changing is a breaking change and belongs in a new version.
const EXPECTED: Record<string, Array<{ name: string; required: string[]; outputSchema: boolean }>> = {
  v1: [{ name: 'go_to_place', required: ['mapId', 'place'], outputSchema: false }],
  v2: [
    { name: 'go_to_place', required: ['mapId', 'query'], outputSchema: true },
    { name: 'filter_map', required: ['mapId', 'mode'], outputSchema: true },
    { name: 'list_maps', required: [], outputSchema: true },
    { name: 'list_uncategorized_articles', required: [], outputSchema: true },
    { name: 'set_article_category', required: ['pageId', 'category'], outputSchema: true },
  ],
};

export async function checkMcpContract(): Promise<CheckResult> {
  const problems: string[] = [];
  for (const [version, expected] of Object.entries(EXPECTED)) {
    let tools: ListedTool[];
    try {
      ({ tools } = await mcpRequest<{ tools: ListedTool[] }>(version, 'tools/list'));
    } catch (err) {
      problems.push(`${version} tools/list failed: ${(err as Error).message}`);
      continue;
    }
    const names = tools.map((t) => t.name);
    const expectedNames = expected.map((e) => e.name);
    if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
      problems.push(`${version} tools are [${names.join(', ')}], expected [${expectedNames.join(', ')}]`);
    }
    for (const want of expected) {
      const tool = tools.find((t) => t.name === want.name);
      if (!tool) continue;
      const required = [...(tool.inputSchema.required ?? [])].sort();
      if (JSON.stringify(required) !== JSON.stringify([...want.required].sort())) {
        problems.push(`${version} ${want.name} requires [${required.join(', ')}], expected [${want.required.join(', ')}]`);
      }
      if (Boolean(tool.outputSchema) !== want.outputSchema) {
        problems.push(`${version} ${want.name} ${want.outputSchema ? 'is missing' : 'unexpectedly has'} an output schema`);
      }
    }
  }
  return problems.length > 0
    ? result('mcp-contract', 'FAIL', problems.join('; '))
    : result('mcp-contract', 'PASS', 'v1 and v2 tool names, required params and output schemas match');
}

// Only calls that can't touch the user's map or data: reads, and calls aimed at
// a map id no tab can have (ids never contain '0'), so nothing is published.
const VERIFY_MAP_ID = 'verify0';

export async function checkMcpSafeCalls(): Promise<CheckResult> {
  const problems: string[] = [];
  try {
    const list = await callTool('v2', 'list_uncategorized_articles', { limit: 1 });
    const content = list.structuredContent as { articles?: unknown; categories?: unknown[] } | undefined;
    if (list.isError) problems.push(`list_uncategorized_articles errored: ${toolText(list)}`);
    else if (!Array.isArray(content?.articles) || !Array.isArray(content?.categories) || content.categories.length === 0) {
      problems.push('list_uncategorized_articles returned no articles/categories arrays');
    }

    const maps = await callTool('v2', 'list_maps', {});
    if (maps.isError || !Array.isArray((maps.structuredContent as { maps?: unknown } | undefined)?.maps)) {
      problems.push(`list_maps did not return a maps array: ${toolText(maps)}`);
    }

    const filter = await callTool('v2', 'filter_map', { mapId: VERIFY_MAP_ID, mode: 'all' });
    if (!filter.isError || !toolText(filter).includes('No open OurGaia map')) {
      problems.push(`filter_map did not reject an unknown map id: ${toolText(filter)}`);
    }

    // Each rejection must be for the reason under test — any call aimed at
    // VERIFY_MAP_ID errors anyway, so isError alone proves nothing.
    const unknownCategory = await callTool('v2', 'filter_map', { mapId: VERIFY_MAP_ID, mode: 'only', categories: ['verify-nonsense'] });
    if (!unknownCategory.isError || !toolText(unknownCategory).includes('Unknown category')) {
      problems.push(`filter_map did not reject an unknown category: ${toolText(unknownCategory)}`);
    }

    const unaddressed = await callTool('v2', 'go_to_place', { query: 'verify' });
    if (!unaddressed.isError || !toolText(unaddressed).includes('mapId')) {
      problems.push(`go_to_place did not reject a call without a mapId: ${toolText(unaddressed)}`);
    }

    const goTo = await callTool('v2', 'go_to_place', { mapId: VERIFY_MAP_ID, query: 'verify', zoom: 40 });
    if (!goTo.isError || !toolText(goTo).includes('zoom')) {
      problems.push(`go_to_place did not reject an out-of-range zoom: ${toolText(goTo)}`);
    }
  } catch (err) {
    problems.push(`tool call failed: ${(err as Error).message}`);
  }
  return problems.length > 0
    ? result('mcp-safe-calls', 'FAIL', problems.join('; '))
    : result(
        'mcp-safe-calls',
        'PASS',
        'list_maps and list_uncategorized_articles read; filter_map and go_to_place reject an unknown map id or category, a missing mapId and a bad zoom'
      );
}
