import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer, MCP_VERSIONS } from '../mcp/createServer.js';

export const mcpRouter = Router();

for (const version of MCP_VERSIONS) {
  // Stateless Streamable HTTP: a fresh server + transport per request, so there
  // are no sessions to track and v1/v2 can't leak state into each other.
  mcpRouter.post(`/${version}`, async (req, res) => {
    const server = createMcpServer(version);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error(`[mcp/${version}] request failed:`, err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });

  // Stateless mode has no server-initiated stream or session to delete.
  mcpRouter.all(`/${version}`, (_req, res) => {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
  });
}
