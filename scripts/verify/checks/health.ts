import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { BASE_URL, result, type CheckResult, type HealthReport } from '../lib.js';

// Mirrors tsconfig.server.json's include — the code tsx loads at server start.
// Frontend files are excluded: Vite hot-reloads those without a restart.
const SERVER_SOURCES = ['src/server.ts', 'src/routes', 'src/lib', 'src/mcp'];

export async function fetchHealth(): Promise<{ health?: HealthReport; check: CheckResult }> {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (!res.ok) {
      return { check: result('server-up', 'FAIL', `GET /api/health returned ${res.status} — is the server running this code?`) };
    }
    const health = (await res.json()) as HealthReport;
    return { health, check: result('server-up', 'PASS', `server at ${BASE_URL}, started ${health.startedAt}`) };
  } catch (err) {
    return { check: result('server-up', 'FAIL', `cannot reach ${BASE_URL} (${(err as Error).message}) — run npm run dev`) };
  }
}

export function checkServices(health: HealthReport): CheckResult {
  const problems: string[] = [];
  if (!health.redis) problems.push('Redis not ready (npm run services:up)');
  if (!health.postgres) problems.push('Postgres unreachable (npm run services:up)');
  if (!health.ollama.reachable) problems.push('Ollama unreachable (start Ollama, then restart npm run dev if chat errors persist)');
  else {
    if (!health.ollama.modelInstalled) problems.push(`chat model ${health.ollama.model} not installed (ollama pull ${health.ollama.model})`);
    if (!health.ollama.embedModelInstalled) problems.push(`embed model ${health.ollama.embedModel} not installed (ollama pull ${health.ollama.embedModel})`);
  }
  return problems.length > 0
    ? result('services', 'FAIL', problems.join('; '))
    : result('services', 'PASS', `redis, postgres, ollama up; models ${health.ollama.model} + ${health.ollama.embedModel} installed`);
}

async function newestMtime(target: string): Promise<{ file: string; mtime: number }> {
  const info = await stat(target);
  if (!info.isDirectory()) return { file: target, mtime: info.mtimeMs };
  let newest = { file: target, mtime: 0 };
  for (const entry of await readdir(target, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    if (entry.isFile() && !entry.name.endsWith('.ts')) continue;
    const candidate = await newestMtime(path.join(target, entry.name));
    if (candidate.mtime > newest.mtime) newest = candidate;
  }
  return newest;
}

export async function checkServerFresh(health: HealthReport): Promise<CheckResult> {
  const startedAt = Date.parse(health.startedAt);
  let newest = { file: '', mtime: 0 };
  for (const target of [...SERVER_SOURCES, '.env']) {
    try {
      const candidate = await newestMtime(target);
      if (candidate.mtime > newest.mtime) newest = candidate;
    } catch {
      // .env is optional
    }
  }
  if (newest.mtime > startedAt) {
    return result(
      'server-fresh',
      'FAIL',
      `${newest.file} changed at ${new Date(newest.mtime).toISOString()}, after the server started (${health.startedAt}) — restart npm run dev`
    );
  }
  return result('server-fresh', 'PASS', `no server code or .env changes since start (newest: ${newest.file})`);
}
