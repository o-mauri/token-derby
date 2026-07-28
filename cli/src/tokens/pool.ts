// Bounded-concurrency map for the token scanners. Reading transcripts one file
// at a time leaves the disk idle between awaits; a small pool keeps several
// reads in flight without opening a thousand descriptors at once.

export const SCAN_CONCURRENCY = 12;

/**
 * Run `fn` over every item with at most `limit` in flight. Results keep INPUT
 * order. The first rejection propagates — callers that must fail loud on a bad
 * read (transcripts.ts) rely on that.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}
