import { Router, type Response as ExpressResponse } from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { selectRelevantContext, stripHtml, type RagCandidate } from '../lib/rag.js';
import { createMcpServer } from '../mcp/createServer.js';
import { isMapOpen } from '../lib/mapEvents.js';
import { OLLAMA_MODEL, OLLAMA_URL } from '../lib/ollamaConfig.js';

export const chatRouter = Router();

export { OLLAMA_MODEL, OLLAMA_URL };

// Caps how many times one chat turn can loop through tool calls, so a model
// that keeps calling tools can't spin forever.
const MAX_TOOL_ROUNDS = 3;

// Small models (e.g. llama3.2) call a tool on nearly every turn when one is
// offered — "what tools do you have?" became go_to_place("available tools").
// Only offer tools when the latest user message reads like a map request.
const MAP_INTENT =
  /\b(go|going|take|bring|fly|travel|head|navigate|move|jump|zoom|show|see|visit|find|where|look|center|centre|pan|filter|hide|only|display|unhide|everything)\b/i;

const BASE_SYSTEM_PROMPT =
  'You are a helpful assistant in OurGaia, a map app showing nearby Wikipedia landmarks. ' +
  'You can move the map to a named place, but only do so when the user asks to go to, show, or find ' +
  'a specific place. You can also filter which categories of landmarks the map shows (e.g. only museums, ' +
  'hide parks, show everything) when the user asks. For any other question, answer in plain text.';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

type OllamaMessage =
  | ChatMessage
  | { role: 'assistant'; content: string; tool_calls: OllamaToolCall[] }
  | { role: 'tool'; tool_name: string; content: string };

interface OllamaTool {
  type: 'function';
  function: { name: string; description?: string; parameters: unknown };
}

// The chat reaches tools through the same MCP server external clients use
// (/mcp/v2), connected in-process — so there's one definition of each tool.
// Only map view tools are exposed here; the categorization tools are meant for
// a deliberate agent, not a chat model that might rewrite data mid-conversation.
const CHAT_TOOLS = new Set(['go_to_place', 'filter_map']);
let mcpClientPromise: Promise<Client> | null = null;

function getMcpClient(): Promise<Client> {
  mcpClientPromise ??= (async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createMcpServer('v2').connect(serverTransport);
    const client = new Client({ name: 'ourgaia-chat', version: '1.0.0' });
    await client.connect(clientTransport);
    return client;
  })();
  return mcpClientPromise;
}

// The chat always acts on the map in the tab it was sent from, so `mapId` is
// filled in by runToolCalls — hidden from the model so it can't guess one.
function withoutMapId(schema: { properties?: Record<string, unknown>; required?: string[] }): unknown {
  const { mapId: _mapId, ...properties } = schema.properties ?? {};
  return { ...schema, properties, required: (schema.required ?? []).filter((name) => name !== 'mapId') };
}

export async function getOllamaTools(): Promise<OllamaTool[]> {
  try {
    const { tools } = await (await getMcpClient()).listTools();
    return tools.filter((tool) => CHAT_TOOLS.has(tool.name)).map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: withoutMapId(tool.inputSchema) },
    }));
  } catch (err) {
    // Chat still works without tools; retry the connection on the next request.
    console.error('In-process MCP client unavailable:', err);
    mcpClientPromise = null;
    return [];
  }
}

async function runToolCalls(toolCalls: OllamaToolCall[], mapId: string): Promise<OllamaMessage[]> {
  const client = await getMcpClient();
  return Promise.all(
    toolCalls.map(async ({ function: { name, arguments: args } }) => {
      let content: string;
      try {
        const result = await client.callTool({ name, arguments: { ...args, mapId } });
        content = (result.content as Array<{ type: string; text?: string }>)
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text)
          .join('\n');
      } catch (err) {
        content = `Tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      return { role: 'tool' as const, tool_name: name, content };
    })
  );
}

// Forwards content chunks to the client as ndjson and collects any tool calls
// the model makes along the way (Ollama emits them inside a streamed chunk).
async function pipeOllamaStream(
  body: ReadableStream<Uint8Array>,
  res: ExpressResponse
): Promise<{ content: string; toolCalls: OllamaToolCall[] }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const toolCalls: OllamaToolCall[] = [];
  let streamed = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed: { message?: { content?: unknown; tool_calls?: unknown }; done?: unknown };
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          continue;
        }

        const content = parsed?.message?.content;
        if (typeof content === 'string' && content.length > 0) {
          res.write(`${JSON.stringify({ content })}\n`);
          streamed += content;
        }
        if (Array.isArray(parsed?.message?.tool_calls)) {
          toolCalls.push(...(parsed.message.tool_calls as OllamaToolCall[]));
        }
      }
    }
  } catch {
    // Connection to Ollama dropped mid-stream; end the response as-is so the
    // client can detect the incomplete stream.
  }

  return { content: streamed, toolCalls };
}

function isValidMessage(message: unknown): message is ChatMessage {
  if (typeof message !== 'object' || message === null) return false;
  const { role, content } = message as Record<string, unknown>;
  return (role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim().length > 0;
}

function isValidCandidate(candidate: unknown): candidate is RagCandidate {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const { pageId, title, extract, category } = candidate as Record<string, unknown>;
  return (
    typeof pageId === 'number' &&
    typeof title === 'string' &&
    title.trim().length > 0 &&
    (extract === undefined || typeof extract === 'string') &&
    (category === undefined || typeof category === 'string')
  );
}

export function wantsMapAction(messages: ChatMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return lastUser !== undefined && MAP_INTENT.test(lastUser.content);
}

export async function buildOutgoingMessages(messages: ChatMessage[], rawCandidates: unknown): Promise<ChatMessage[]> {
  const context = await buildLandmarkContext(messages, rawCandidates);
  const content = context
    ? `${BASE_SYSTEM_PROMPT}\n\nHere are landmarks near the user that may be relevant to their question:\n${context}\n\n` +
      'Use this context when relevant; otherwise answer normally.'
    : BASE_SYSTEM_PROMPT;
  return [{ role: 'system', content }, ...messages];
}

async function buildLandmarkContext(messages: ChatMessage[], rawCandidates: unknown): Promise<string | null> {
  const candidates = Array.isArray(rawCandidates) ? rawCandidates.filter(isValidCandidate) : [];
  if (candidates.length === 0) return null;

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return null;

  const relevant = await selectRelevantContext(lastUser.content, candidates);
  if (!relevant) return null;

  return relevant
    .map((c) => {
      const desc = c.extract ? stripHtml(c.extract).slice(0, 300) : 'No description available.';
      return `- ${c.title}${c.category ? ` [${c.category}]` : ''}: ${desc}`;
    })
    .join('\n');
}

chatRouter.post('/', async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }
  if (!messages.every(isValidMessage)) {
    res.status(400).json({ error: 'each message must have a role of "user" or "assistant" and non-empty content' });
    return;
  }

  // Map tools need the id of the tab the chat runs in, and that map must be
  // open — a tab mid-reconnect can send a stale id. Without one the chat still
  // answers, it just can't change the map (and isn't told to call tools it lacks).
  const mapId = typeof req.body?.mapId === 'string' && isMapOpen(req.body.mapId) ? req.body.mapId : undefined;
  let outgoingMessages: OllamaMessage[] = await buildOutgoingMessages(messages, req.body?.candidates);
  const tools = mapId && wantsMapAction(messages) ? await getOllamaTools() : [];

  for (let round = 0; ; round++) {
    const offerTools = tools.length > 0 && round < MAX_TOOL_ROUNDS;

    let ollamaRes: Response;
    try {
      ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: outgoingMessages,
          stream: true,
          ...(offerTools ? { tools } : {}),
        }),
      });
    } catch {
      if (!res.headersSent) res.status(502).json({ error: 'Ollama request failed' });
      else res.end();
      return;
    }

    if (!ollamaRes.ok || !ollamaRes.body) {
      if (!res.headersSent) res.status(502).json({ error: 'Ollama returned an error' });
      else res.end();
      return;
    }

    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
    }

    const { content, toolCalls } = await pipeOllamaStream(ollamaRes.body, res);
    if (toolCalls.length === 0 || !offerTools || !mapId) break;

    outgoingMessages = [
      ...outgoingMessages,
      // The text the user already saw this round, so the model doesn't repeat it.
      { role: 'assistant', content, tool_calls: toolCalls },
      ...(await runToolCalls(toolCalls, mapId)),
    ];
  }

  res.end();
});
