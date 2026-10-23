export type CheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

export const BASE_URL = process.env.VERIFY_BASE_URL ?? 'http://localhost:8080';

export function result(name: string, status: CheckStatus, detail: string): CheckResult {
  return { name, status, detail };
}

export interface HealthReport {
  startedAt: string;
  redis: boolean;
  postgres: boolean;
  ollama: {
    reachable: boolean;
    model: string;
    modelInstalled: boolean;
    embedModel: string;
    embedModelInstalled: boolean;
  };
}

export interface McpToolResult {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
}

// Stateless Streamable HTTP: each JSON-RPC request is one POST, answered as an
// SSE stream carrying a single `data:` line.
export async function mcpRequest<T>(version: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}/mcp/${version}`, {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
  if (!dataLine) throw new Error('no data line in MCP response');
  const payload = JSON.parse(dataLine.slice('data: '.length)) as { result?: T; error?: { message: string } };
  if (payload.error) throw new Error(payload.error.message);
  return payload.result as T;
}

export function callTool(version: string, name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  return mcpRequest<McpToolResult>(version, 'tools/call', { name, arguments: args });
}

export function toolText(r: McpToolResult): string {
  return (r.content ?? []).map((c) => c.text ?? '').join('\n');
}
