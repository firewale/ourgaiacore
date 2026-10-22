import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerV1Tools } from './tools/v1.js';
import { registerV2Tools } from './tools/v2.js';

export type McpVersion = 'v1' | 'v2';

export const MCP_VERSIONS: McpVersion[] = ['v1', 'v2'];

// Each version is its own tool contract. serverInfo.version is informational
// only — clients pick a contract by URL (/mcp/v1, /mcp/v2), not by negotiation.
const registrars: Record<McpVersion, { serverVersion: string; register: (server: McpServer) => void }> = {
  v1: { serverVersion: '1.0.0', register: registerV1Tools },
  v2: { serverVersion: '2.0.0', register: registerV2Tools },
};

export function createMcpServer(version: McpVersion): McpServer {
  const { serverVersion, register } = registrars[version];
  const server = new McpServer({ name: 'ourgaia', version: serverVersion });
  register(server);
  return server;
}
