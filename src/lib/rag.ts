const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';
const TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.3;
const MAX_EXTRACT_CHARS = 500;

export interface RagCandidate {
  pageId: number;
  title: string;
  extract?: string;
  category?: string;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function toEmbeddingText(c: RagCandidate): string {
  const plain = c.extract ? stripHtml(c.extract).slice(0, MAX_EXTRACT_CHARS) : '';
  return `${c.title}. ${plain}`.trim();
}

/**
 * Returns the top-K candidates most relevant to `query` by embedding
 * similarity, or null if embedding failed, candidates was empty, or nothing
 * cleared the similarity threshold.
 */
export async function selectRelevantContext(
  query: string,
  candidates: RagCandidate[]
): Promise<RagCandidate[] | null> {
  if (candidates.length === 0) return null;

  const texts = candidates.map(toEmbeddingText);

  let embeddings: number[][];
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, input: [...texts, query] }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embeddings?: number[][] };
    if (!Array.isArray(data.embeddings) || data.embeddings.length !== texts.length + 1) return null;
    embeddings = data.embeddings;
  } catch {
    return null;
  }

  const queryVec = embeddings[embeddings.length - 1];
  const ranked = candidates
    .map((candidate, i) => ({ candidate, score: cosineSimilarity(embeddings[i], queryVec) }))
    .sort((a, b) => b.score - a.score)
    .filter((s) => s.score >= SIMILARITY_THRESHOLD)
    .slice(0, TOP_K);

  return ranked.length > 0 ? ranked.map((s) => s.candidate) : null;
}
