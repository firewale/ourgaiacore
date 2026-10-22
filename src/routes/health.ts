import { Router } from 'express';
import { isRedisReady } from '../lib/redisClient.js';
import { getDbClient } from '../lib/dbClient.js';
import { OLLAMA_EMBED_MODEL, OLLAMA_MODEL, OLLAMA_URL } from '../lib/ollamaConfig.js';

export const healthRouter = Router();

// Captured once per process, so a verifier can compare it against source
// mtimes and tell when the running server predates the code on disk.
const startedAt = new Date().toISOString();

const CHECK_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function postgresReachable(): Promise<boolean> {
  try {
    await withTimeout(getDbClient().query('SELECT 1'));
    return true;
  } catch {
    return false;
  }
}

// Ollama reports models as "name:tag"; a bare configured name means ":latest".
function hasModel(installed: string[], model: string): boolean {
  return installed.includes(model) || installed.includes(`${model}:latest`);
}

async function ollamaStatus() {
  const status = {
    reachable: false,
    model: OLLAMA_MODEL,
    modelInstalled: false,
    embedModel: OLLAMA_EMBED_MODEL,
    embedModelInstalled: false,
  };
  try {
    const res = await withTimeout(fetch(`${OLLAMA_URL}/api/tags`));
    if (!res.ok) return status;
    const { models = [] } = (await res.json()) as { models?: Array<{ name: string }> };
    const installed = models.map((m) => m.name);
    return {
      ...status,
      reachable: true,
      modelInstalled: hasModel(installed, OLLAMA_MODEL),
      embedModelInstalled: hasModel(installed, OLLAMA_EMBED_MODEL),
    };
  } catch {
    return status;
  }
}

// Reports dependency status rather than failing — always 200, so callers can
// see exactly which piece is down.
healthRouter.get('/', async (_req, res) => {
  const [postgres, ollama] = await Promise.all([postgresReachable(), ollamaStatus()]);
  res.json({ startedAt, redis: isRedisReady(), postgres, ollama });
});
