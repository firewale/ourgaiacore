import { toPlainExcerpt } from '../../../src/scripts/modules/candidateExcerpt.js';
import { BASE_URL, result, type CheckResult } from '../lib.js';

// Central London: dense enough to hit geosearch's 500-article cap, and within
// the route's 0.2° per-side limit.
const BBOX = { north: 51.53, south: 51.48, east: -0.08, west: -0.16 };

interface Article {
  pageId: number;
  title: string;
  extract?: string;
  category?: string;
}

// Builds the largest realistic chat request — every landmark in a busy
// viewport as a RAG candidate, trimmed exactly as the browser does — and sends
// it with an empty message list. The route rejects that with 400 after the
// body parser accepts the body, so no Ollama call is made; a 413 means the
// body limit is too small for real traffic.
export async function checkPayloadSize(): Promise<CheckResult> {
  const qs = new URLSearchParams(Object.entries(BBOX).map(([k, v]) => [k, String(v)]));
  let articles: Article[];
  try {
    const res = await fetch(`${BASE_URL}/api/wikipedia?${qs}`);
    if (!res.ok) return result('payload-size', 'SKIP', `GET /api/wikipedia returned ${res.status} (Wikipedia rate limit?) — rerun later`);
    const merged: Record<string, Article> = {};
    for (const line of (await res.text()).split('\n')) {
      if (line.trim()) Object.assign(merged, JSON.parse(line));
    }
    articles = Object.values(merged);
  } catch (err) {
    return result('payload-size', 'SKIP', `could not fetch landmarks: ${(err as Error).message}`);
  }
  if (articles.length === 0) return result('payload-size', 'SKIP', 'no landmarks returned for the test area');

  const candidates = articles.map(({ pageId, title, extract, category }) => ({
    pageId,
    title,
    extract: extract === undefined ? undefined : toPlainExcerpt(extract),
    category,
  }));
  const body = JSON.stringify({ messages: [], candidates });
  const kb = (Buffer.byteLength(body) / 1024).toFixed(0);

  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (res.status === 413) {
    return result('payload-size', 'FAIL', `chat request with ${articles.length} landmarks (${kb} KB) rejected with 413 — body limit too small`);
  }
  if (res.status !== 400) {
    return result('payload-size', 'FAIL', `expected 400 for an empty message list, got ${res.status}`);
  }
  return result('payload-size', 'PASS', `chat request with ${articles.length} landmarks (${kb} KB) accepted by the body parser`);
}
