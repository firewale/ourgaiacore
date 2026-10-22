import 'dotenv/config';
import { checkServerFresh, checkServices, fetchHealth } from './checks/health.js';
import { checkMcpContract, checkMcpSafeCalls } from './checks/mcp.js';
import { checkPayloadSize } from './checks/payload.js';
import { checkDbInvariants } from './checks/db.js';
import { result, type CheckResult } from './lib.js';

// Checks the running stack (npm run dev + services), not mocks. Side-effect
// free for the user's open map and data: reads, plus tool calls that are
// rejected before anything is published to map tabs.
const SERVER_CHECKS = ['services', 'server-fresh', 'mcp-contract', 'mcp-safe-calls', 'payload-size'];

async function run(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const { health, check } = await fetchHealth();
  results.push(check);

  if (health) {
    results.push(checkServices(health));
    results.push(await checkServerFresh(health));
    results.push(await checkMcpContract());
    results.push(await checkMcpSafeCalls());
    results.push(await checkPayloadSize());
  } else {
    for (const name of SERVER_CHECKS) results.push(result(name, 'SKIP', 'server-up failed'));
  }

  results.push(await checkDbInvariants());
  return results;
}

function printTable(results: CheckResult[]): void {
  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.name.padEnd(width)}  ${r.detail}`);
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;
  console.log(`\n${results.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`);
  if (results.find((r) => r.name === 'server-fresh')?.status === 'FAIL') {
    console.log('Note: the server is running older code than what is on disk, so the other server checks tested that older code.');
  }
}

const results = await run();
if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
else printTable(results);
process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
