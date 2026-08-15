const MIN_INTERVAL_MS = 1100; // stay safely under Nominatim's 1 req/sec usage policy

let queue: Promise<void> = Promise.resolve();
let lastCallAt = 0;

export async function throttledFetch(url: string, init?: RequestInit): Promise<Response> {
  const run = async (): Promise<Response> => {
    const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
    return fetch(url, init);
  };

  const result = queue.then(run, run);
  queue = result.then(() => undefined, () => undefined);
  return result;
}
