import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ScanCache, type FileFold } from '../src/scan-cache.js';

let home: string;
let work: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-home-'));
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'td-work-'));
  process.env.TOKEN_DERBY_HOME = home;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(home, { recursive: true, force: true });
  await fs.rm(work, { recursive: true, force: true });
});

/** A fold that records exactly which lines it was asked to consume. */
function collector(): FileFold<string[]> {
  return {
    empty: () => [],
    append: (acc, lines) => [...acc, ...lines],
  };
}

/** Give a file a deterministic mtime so tests never race the clock. */
async function setMtime(file: string, epochSec: number): Promise<void> {
  await fs.utimes(file, epochSec, epochSec);
}

describe('ScanCache.readIncremental', () => {
  it('folds the whole file on first read', async () => {
    const f = path.join(work, 'a.jsonl');
    await fs.writeFile(f, 'one\ntwo\n');
    const cache = await ScanCache.open('claude');
    expect(await cache.readIncremental(f, collector())).toEqual(['one', 'two']);
  });

  it('folds only the appended lines when the file grows', async () => {
    const f = path.join(work, 'a.jsonl');
    await fs.writeFile(f, 'one\ntwo\n');
    const cache = await ScanCache.open('claude');
    await cache.readIncremental(f, collector());

    await fs.appendFile(f, 'three\n');
    // The fold starts from the cached value, so a correct incremental read
    // yields all four lines while only ever consuming 'three'.
    const seen: string[][] = [];
    const spy: FileFold<string[]> = {
      empty: () => [],
      append: (acc, lines) => { seen.push(lines); return [...acc, ...lines]; },
    };
    expect(await cache.readIncremental(f, spy)).toEqual(['one', 'two', 'three']);
    expect(seen).toEqual([['three']]); // 'one'/'two' were never re-parsed
  });

  it('returns the cached value without touching a file whose mtime and size are unchanged', async () => {
    const f = path.join(work, 'a.jsonl');
    await fs.writeFile(f, 'one\ntwo\n');
    await setMtime(f, 1_700_000_000);
    const cache = await ScanCache.open('claude');
    expect(await cache.readIncremental(f, collector())).toEqual(['one', 'two']);

    // Same byte length, same mtime, different content: a cache that re-reads
    // would notice. One that trusts stat correctly does not.
    await fs.writeFile(f, 'ONE\nTWO\n');
    await setMtime(f, 1_700_000_000);
    expect(await cache.readIncremental(f, collector())).toEqual(['one', 'two']);
  });

  it('re-reads from scratch when the file shrinks (truncated or rotated)', async () => {
    const f = path.join(work, 'a.jsonl');
    await fs.writeFile(f, 'one\ntwo\nthree\n');
    const cache = await ScanCache.open('claude');
    await cache.readIncremental(f, collector());

    await fs.writeFile(f, 'fresh\n');
    expect(await cache.readIncremental(f, collector())).toEqual(['fresh']);
  });

  it('re-reads from scratch when the content changes in place at the same size', async () => {
    const f = path.join(work, 'a.jsonl');
    await fs.writeFile(f, 'one\ntwo\n');
    await setMtime(f, 1_700_000_000);
    const cache = await ScanCache.open('claude');
    await cache.readIncremental(f, collector());

    await fs.writeFile(f, 'ONE\nTWO\n');
    await setMtime(f, 1_700_000_500); // same size, newer mtime → not append-only
    expect(await cache.readIncremental(f, collector())).toEqual(['ONE', 'TWO']);
  });

  it('reports a newline-less trailing line but never commits it, so completing it cannot double-count', async () => {
    const f = path.join(work, 'a.jsonl');
    await fs.writeFile(f, 'one\npar');
    const cache = await ScanCache.open('claude');
    // A plain whole-file read counts a final line with no newline, so this must too.
    expect(await cache.readIncremental(f, collector())).toEqual(['one', 'par']);

    await fs.appendFile(f, 'tial\n');
    // 'par' was returned but not cached — completing the line yields 'partial', not both.
    expect(await cache.readIncremental(f, collector())).toEqual(['one', 'partial']);
  });

  it('propagates a read error instead of caching a wrong value', async () => {
    const f = path.join(work, 'broken.jsonl');
    await fs.mkdir(f); // a directory where a transcript should be
    const cache = await ScanCache.open('claude');
    await expect(cache.readIncremental(f, collector())).rejects.toThrow();
  });
});

describe('ScanCache.readWhenChanged', () => {
  it('recomputes only when the file changes', async () => {
    const f = path.join(work, 'chat.json');
    await fs.writeFile(f, '{"n":1}');
    await setMtime(f, 1_700_000_000);
    const cache = await ScanCache.open('gemini');

    let computes = 0;
    const compute = async (raw: string) => { computes += 1; return JSON.parse(raw).n as number; };

    expect(await cache.readWhenChanged(f, compute)).toBe(1);
    expect(await cache.readWhenChanged(f, compute)).toBe(1);
    expect(computes).toBe(1); // second call served from cache

    await fs.writeFile(f, '{"n":22}');
    expect(await cache.readWhenChanged(f, compute)).toBe(22);
    expect(computes).toBe(2);
  });
});

describe('ScanCache persistence', () => {
  it('survives a save and reopen, so the next beat starts warm', async () => {
    const f = path.join(work, 'a.jsonl');
    await fs.writeFile(f, 'one\ntwo\n');
    const first = await ScanCache.open('claude');
    await first.readIncremental(f, collector());
    await first.save();

    await fs.appendFile(f, 'three\n');
    const second = await ScanCache.open('claude');
    const seen: string[][] = [];
    const spy: FileFold<string[]> = {
      empty: () => [],
      append: (acc, lines) => { seen.push(lines); return [...acc, ...lines]; },
    };
    expect(await second.readIncremental(f, spy)).toEqual(['one', 'two', 'three']);
    expect(seen).toEqual([['three']]); // warm across process restarts
  });

  it('drops entries for files it no longer sees, so the cache cannot grow forever', async () => {
    const a = path.join(work, 'a.jsonl');
    const b = path.join(work, 'b.jsonl');
    await fs.writeFile(a, 'one\n');
    await fs.writeFile(b, 'two\n');
    const first = await ScanCache.open('claude');
    await first.readIncremental(a, collector());
    await first.readIncremental(b, collector());
    await first.save();

    await fs.rm(b);
    const second = await ScanCache.open('claude');
    await second.readIncremental(a, collector()); // b never read this beat
    await second.save();

    const third = await ScanCache.open('claude');
    expect(third.has(a)).toBe(true);
    expect(third.has(b)).toBe(false);
  });

  it('keeps each source in its own file so they cannot clobber each other', async () => {
    const f = path.join(work, 'a.jsonl');
    await fs.writeFile(f, 'one\n');
    const claude = await ScanCache.open('claude');
    await claude.readIncremental(f, collector());
    await claude.save();

    const codex = await ScanCache.open('codex');
    expect(codex.has(f)).toBe(false);
    await codex.save();

    expect((await ScanCache.open('claude')).has(f)).toBe(true);
  });

  it('reports the total bytes it has seen, for diagnosing a slow source', async () => {
    const a = path.join(work, 'a.jsonl');
    const b = path.join(work, 'b.jsonl');
    await fs.writeFile(a, 'one\n');   // 4 bytes
    await fs.writeFile(b, 'three\n'); // 6 bytes
    const cache = await ScanCache.open('claude');
    await cache.readIncremental(a, collector());
    await cache.readIncremental(b, collector());
    await cache.save();

    expect(await ScanCache.knownBytes('claude')).toBe(10);
  });

  it('reports zero bytes for a source it has never scanned', async () => {
    expect(await ScanCache.knownBytes('codex')).toBe(0);
  });

  it('treats a corrupt cache file as empty rather than failing the scan', async () => {
    await fs.mkdir(path.join(home, 'scan-cache'), { recursive: true });
    await fs.writeFile(path.join(home, 'scan-cache', 'claude.json'), '{not json');
    const cache = await ScanCache.open('claude');
    const f = path.join(work, 'a.jsonl');
    await fs.writeFile(f, 'one\n');
    expect(await cache.readIncremental(f, collector())).toEqual(['one']);
  });

  it('discards entries written by a different parsing version', async () => {
    const f = path.join(work, 'a.jsonl');
    await fs.writeFile(f, 'one\ntwo\n');
    const first = await ScanCache.open('claude');
    await first.readIncremental(f, collector());
    await first.save();

    const file = path.join(home, 'scan-cache', 'claude.json');
    const raw = JSON.parse(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, JSON.stringify({ ...raw, version: raw.version + 1 }));

    expect((await ScanCache.open('claude')).has(f)).toBe(false);
  });
});
