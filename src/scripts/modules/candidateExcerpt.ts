// The server only embeds the first 500 plain-text chars of each extract (see
// MAX_EXTRACT_CHARS in src/lib/rag.ts). Sending full HTML intros for hundreds of
// visible landmarks overflows the server's JSON body limit, so trim client-side.
// DOM-free so scripts/verify can build candidates exactly the way the chat does.
export const MAX_CANDIDATE_EXTRACT_CHARS = 500;

export function toPlainExcerpt(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CANDIDATE_EXTRACT_CHARS);
}
