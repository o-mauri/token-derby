// Incremental scan cache. Transcripts are append-only, so re-parsing a whole
// history every beat is wasted work that grows without bound. This keeps
// {file → mtime, size, byte offset, folded value} so an untouched file costs a
// single stat and a grown one costs only the bytes appended since last time.
//
// The cache is an OPTIMIZATION, never a source of truth: a missing, corrupt or
// stale-versioned cache simply means a full re-read. Read errors always
// propagate so a scanner's fail-loud contract is preserved.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { scanCacheDir } from './paths.js';

// Bump whenever the meaning of a folded value changes (e.g. which usage fields
// count), so entries written by older logic are discarded rather than trusted.
const CACHE_VERSION = 1;

/** How a source turns appended lines into its running per-file value. */
export type FileFold<T> = {
  /** Value for a file being read from scratch. */
  empty: () => T;
  /** Fold newly-appended complete lines into the accumulated value. */
  append: (acc: T, lines: string[]) => T;
};

type Entry = { mtimeMs: number; size: number; offset: number; value: unknown };

function isEntry(v: unknown): v is Entry {
  const e = v as Entry;
  return !!e && typeof e.mtimeMs === 'number' && typeof e.size === 'number' && typeof e.offset === 'number';
}

export class ScanCache {
  private readonly touched = new Set<string>();

  private constructor(
    private readonly source: string,
    private readonly entries: Map<string, Entry>,
  ) {}

  static async open(source: string): Promise<ScanCache> {
    return new ScanCache(source, await loadEntries(source));
  }

  /**
   * Total bytes this source was known to hold at its last completed scan, for
   * diagnosing which source is blowing the beat budget. 0 = never scanned.
   */
  static async knownBytes(source: string): Promise<number> {
    let total = 0;
    for (const entry of (await loadEntries(source)).values()) total += entry.size;
    return total;
  }

  has(file: string): boolean {
    return this.entries.has(file);
  }

  /**
   * Fold an append-only file, consuming only the bytes added since last time.
   *
   * A trailing line with no newline yet is folded into the RETURNED value but
   * not committed to the cache — matching a plain whole-file read, while still
   * re-reading that line once the writer completes it.
   */
  async readIncremental<T>(file: string, fold: FileFold<T>): Promise<T> {
    const st = await fs.stat(file);
    const prev = this.entries.get(file);
    this.touched.add(file);

    // Untouched: same mtime AND same size. One stat, no read, no parse.
    if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) return prev.value as T;

    // Only growth is safe to treat as an append; anything else was rewritten,
    // truncated or rotated and must be read from scratch.
    const grew = prev !== undefined && st.size > prev.size;
    const start = grew ? prev.offset : 0;
    const acc = grew ? (prev.value as T) : fold.empty();

    const { lines, tail, consumedTo } = await readCompleteLines(file, start, st.size);
    const committed = lines.length > 0 ? fold.append(acc, lines) : acc;
    this.entries.set(file, { mtimeMs: st.mtimeMs, size: st.size, offset: consumedTo, value: committed });
    return tail === null ? committed : fold.append(committed, [tail]);
  }

  /**
   * For files that are rewritten whole rather than appended to (Gemini's .json
   * chats). Gated on mtime+size, recomputed in full whenever either moves.
   */
  async readWhenChanged<T>(file: string, compute: (raw: string) => Promise<T>): Promise<T> {
    const st = await fs.stat(file);
    const prev = this.entries.get(file);
    this.touched.add(file);
    if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) return prev.value as T;

    const value = await compute(await fs.readFile(file, 'utf8'));
    this.entries.set(file, { mtimeMs: st.mtimeMs, size: st.size, offset: st.size, value });
    return value;
  }

  /** Persist, dropping any entry not read since `open` so the file can't grow forever. */
  async save(): Promise<void> {
    for (const key of [...this.entries.keys()]) {
      if (!this.touched.has(key)) this.entries.delete(key);
    }
    const target = cacheFile(this.source);
    const tmp = `${target}.tmp`;
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(tmp, JSON.stringify({ version: CACHE_VERSION, files: Object.fromEntries(this.entries) }));
      await fs.rename(tmp, target); // swap in whole, never leave a half-written cache
    } catch {
      // A cache we can't write costs the next beat some speed, never correctness.
    }
  }
}

function cacheFile(source: string): string {
  return path.join(scanCacheDir(), `${source}.json`);
}

async function loadEntries(source: string): Promise<Map<string, Entry>> {
  let parsed: any;
  try {
    parsed = JSON.parse(await fs.readFile(cacheFile(source), 'utf8'));
  } catch {
    return new Map(); // absent or corrupt → start cold
  }
  if (parsed?.version !== CACHE_VERSION || typeof parsed.files !== 'object' || parsed.files === null) {
    return new Map();
  }
  const out = new Map<string, Entry>();
  for (const [file, entry] of Object.entries(parsed.files)) {
    if (isEntry(entry)) out.set(file, entry);
  }
  return out;
}

/**
 * Read bytes [start, end) and split into complete lines. `consumedTo` is the
 * byte after the last newline — never mid-line, so the next read resumes on a
 * clean boundary. `tail` is any bytes after that newline (null if none).
 */
async function readCompleteLines(
  file: string,
  start: number,
  end: number,
): Promise<{ lines: string[]; tail: string | null; consumedTo: number }> {
  if (end <= start) return { lines: [], tail: null, consumedTo: start };
  const fh = await fs.open(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(end - start);
    const { bytesRead } = await fh.read(buf, 0, end - start, start);
    const chunk = buf.subarray(0, bytesRead);
    // Split on the byte, not the decoded string: 0x0A cannot occur inside a
    // multi-byte UTF-8 sequence, so this boundary is always safe to resume from.
    const lastNl = chunk.lastIndexOf(0x0a);
    if (lastNl === -1) {
      return { lines: [], tail: chunk.toString('utf8') || null, consumedTo: start };
    }
    const tail = chunk.subarray(lastNl + 1).toString('utf8');
    return {
      lines: chunk.subarray(0, lastNl).toString('utf8').split('\n'),
      tail: tail === '' ? null : tail,
      consumedTo: start + lastNl + 1,
    };
  } finally {
    await fh.close();
  }
}
