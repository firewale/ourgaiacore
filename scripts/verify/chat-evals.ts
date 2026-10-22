import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import {
  OLLAMA_MODEL,
  OLLAMA_URL,
  buildOutgoingMessages,
  getOllamaTools,
  wantsMapAction,
  type ChatMessage,
  type OllamaToolCall,
} from '../../src/routes/chat.js';
import { resolveCategory } from '../../src/mcp/mapFilter.js';
import { initCategories } from '../../src/lib/categories.js';
import { getDbClient } from '../../src/lib/dbClient.js';
import type { CheckStatus } from './lib.js';

// Model-behavior evals: sends exactly what POST /api/chat sends on its first
// round (system prompt, intent-gated tools) and judges which tool the model
// picks. Tools are never executed, so the user's map and data are untouched.
//   npm run verify:chat [-- --model llama3.2] [--repeat 3] [--no-gate] [--report-only]
// --no-gate offers tools on every prompt, testing the model's own judgment
// rather than the chat's keyword gate in front of it.

interface EvalCase {
  prompt: string;
  expect: {
    tool: string | null;
    queryIncludes?: string;
    mode?: string;
    categories?: string[];
  };
}

interface Outcome {
  status: CheckStatus;
  got: string;
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const model = argValue('--model') ?? OLLAMA_MODEL;
const repeat = Number(argValue('--repeat') ?? 1);
const reportOnly = process.argv.includes('--report-only');
const noGate = process.argv.includes('--no-gate');

function describe(call: OllamaToolCall | undefined): string {
  return call ? `${call.function.name} ${JSON.stringify(call.function.arguments)}` : 'no tool (text answer)';
}

function judge(expect: EvalCase['expect'], call: OllamaToolCall | undefined): Outcome {
  const got = describe(call);
  if (expect.tool === null) return { status: call ? 'FAIL' : 'PASS', got };
  if (!call || call.function.name !== expect.tool) return { status: 'FAIL', got };

  const args = call.function.arguments as Record<string, unknown>;
  if (expect.queryIncludes) {
    const query = String(args.query ?? '').toLowerCase();
    return { status: query.includes(expect.queryIncludes) ? 'PASS' : 'FAIL', got };
  }
  if (expect.mode && args.mode !== expect.mode) return { status: 'FAIL', got };
  if (!expect.categories) return { status: 'PASS', got };

  // Judge category names the way filter_map will resolve them. A name it can't
  // resolve isn't fatal — the tool's error lists valid ids and the model can
  // retry — so that's a WARN as long as everything that did resolve is right.
  const names = Array.isArray(args.categories) ? args.categories.map(String) : [];
  const resolved = new Set<string>();
  let unresolved = 0;
  for (const name of names) {
    const match = resolveCategory(name);
    if (match) resolved.add(match.id);
    else unresolved++;
  }
  const expected = new Set(expect.categories);
  const allCorrect = [...resolved].every((id) => expected.has(id));
  if (!allCorrect) return { status: 'FAIL', got };
  if (unresolved === 0 && resolved.size === expected.size) return { status: 'PASS', got };
  return { status: unresolved > 0 ? 'WARN' : 'FAIL', got };
}

async function runCase(evalCase: EvalCase): Promise<Outcome> {
  const messages: ChatMessage[] = [{ role: 'user', content: evalCase.prompt }];
  if (!noGate && !wantsMapAction(messages)) {
    // Tools aren't offered at all — the chat can only answer in text.
    return expect(evalCase, undefined, 'intent gate: no tools offered');
  }
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({
      model,
      stream: false,
      messages: await buildOutgoingMessages(messages, undefined),
      tools: await getOllamaTools(),
    }),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status} for model ${model}`);
  const { message } = (await res.json()) as { message: { tool_calls?: OllamaToolCall[] } };
  return judge(evalCase.expect, message.tool_calls?.[0]);
}

function expect(evalCase: EvalCase, call: OllamaToolCall | undefined, note: string): Outcome {
  const outcome = judge(evalCase.expect, call);
  return { ...outcome, got: `${outcome.got} (${note})` };
}

const cases = JSON.parse(
  await readFile(new URL('./chat-evals.json', import.meta.url), 'utf8')
) as EvalCase[];

// Load the live category list (user-added ones included) so category names
// resolve the same way they do in the running server.
await initCategories();

console.log(`Chat evals — model ${model}, ${cases.length} cases × ${repeat}${noGate ? ', intent gate off' : ''}\n`);
let failures = 0;
let total = 0;
for (const evalCase of cases) {
  const outcomes: Outcome[] = [];
  for (let i = 0; i < repeat; i++) outcomes.push(await runCase(evalCase));
  const passes = outcomes.filter((o) => o.status === 'PASS').length;
  const worst = outcomes.find((o) => o.status === 'FAIL') ?? outcomes.find((o) => o.status === 'WARN') ?? outcomes[0];
  failures += outcomes.filter((o) => o.status === 'FAIL').length;
  total += outcomes.length;
  console.log(`${worst.status.padEnd(4)}  ${passes}/${repeat}  ${evalCase.prompt}`);
  console.log(`            got: ${worst.got}`);
}
console.log(`\n${total - failures}/${total} runs without a failure`);

await getDbClient().end();
process.exit(failures > 0 && !reportOnly ? 1 : 0);
