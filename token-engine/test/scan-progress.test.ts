import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ScanProgress, describeScanTimeout, diagnoseScanTimeout } from '../src/scan-progress.js';
import { ScanCache } from '../src/scan-cache.js';

describe('ScanProgress', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports a source that has not finished as outstanding', () => {
    const p = new ScanProgress();
    p.begin('claude');
    p.begin('codex');
    vi.advanceTimersByTime(5_000);
    p.end('claude');
    vi.advanceTimersByTime(40_000);
    expect(p.outstanding()).toEqual(['codex']);
  });

  it('reports nothing outstanding once every source has finished', () => {
    const p = new ScanProgress();
    p.begin('claude');
    p.end('claude');
    expect(p.outstanding()).toEqual([]);
  });

  it('orders outstanding sources longest-running first', () => {
    const p = new ScanProgress();
    p.begin('gemini');
    vi.advanceTimersByTime(1_000);
    p.begin('codex');
    vi.advanceTimersByTime(1_000);
    expect(p.outstanding()).toEqual(['gemini', 'codex']);
  });

  it('does not report a source that was never started', () => {
    const p = new ScanProgress();
    p.begin('claude');
    expect(p.outstanding()).toEqual(['claude']);
  });
});

describe('describeScanTimeout', () => {
  it('names the source still scanning and its size', () => {
    const msg = describeScanTimeout(45_000, [{ key: 'codex', bytes: 2_010_000_000 }]);
    expect(msg).toContain('45s');
    expect(msg).toContain('codex');
    expect(msg).toContain('2.0 GB');
  });

  it('points at the env var that skips the offending source', () => {
    const msg = describeScanTimeout(45_000, [{ key: 'codex', bytes: 2_010_000_000 }]);
    expect(msg).toContain('TOKEN_DERBY_CODEX_DIR');
  });

  it('omits the size when it is not known yet (first ever scan)', () => {
    const msg = describeScanTimeout(45_000, [{ key: 'codex', bytes: 0 }]);
    expect(msg).toContain('codex');
    expect(msg).not.toContain('GB');
    expect(msg).not.toContain('MB');
  });

  it('names every outstanding source, hinting at the largest', () => {
    const msg = describeScanTimeout(45_000, [
      { key: 'claude', bytes: 1_450_000_000 },
      { key: 'codex', bytes: 2_010_000_000 },
    ]);
    expect(msg).toContain('claude');
    expect(msg).toContain('codex');
    expect(msg).toContain('TOKEN_DERBY_CODEX_DIR'); // the bigger of the two
  });

  it('falls back to a plain message when nothing is outstanding', () => {
    const msg = describeScanTimeout(45_000, []);
    expect(msg).toContain('timed out');
    expect(msg).toContain('45s');
    expect(msg).not.toContain('TOKEN_DERBY');
  });

  it('does not end in punctuation, because the UI appends ". Your race continues."', () => {
    for (const outstanding of [
      [],
      [{ key: 'codex' as const, bytes: 2_010_000_000 }],
      [{ key: 'claude' as const, bytes: 1_000 }, { key: 'codex' as const, bytes: 2_000 }],
    ]) {
      expect(describeScanTimeout(45_000, outstanding)).not.toMatch(/[.,;:]$/);
    }
  });

  it('shows sub-gigabyte sizes in MB', () => {
    const msg = describeScanTimeout(45_000, [{ key: 'gemini', bytes: 3_000_000 }]);
    expect(msg).toContain('3 MB');
  });
});

describe('diagnoseScanTimeout', () => {
  let home: string;
  let work: string;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-diag-home-'));
    work = await fs.mkdtemp(path.join(os.tmpdir(), 'td-diag-work-'));
    process.env.TOKEN_DERBY_HOME = home;
  });
  afterEach(async () => {
    delete process.env.TOKEN_DERBY_HOME;
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(work, { recursive: true, force: true });
  });

  it('sizes the outstanding source from the cache that source wrote', async () => {
    const f = path.join(work, 'r.jsonl');
    await fs.writeFile(f, 'x'.repeat(2_010_000_00) + '\n'); // ~201 MB
    const cache = await ScanCache.open('codex');
    await cache.readIncremental(f, { empty: () => 0, append: (a, l) => a + l.length });
    await cache.save();

    const progress = new ScanProgress();
    progress.begin('codex');   // started, never ended → outstanding
    progress.begin('claude');
    progress.end('claude');

    const msg = await diagnoseScanTimeout(45_000, progress);
    expect(msg).toContain('codex');
    expect(msg).toContain('201 MB');
    expect(msg).not.toContain('claude'); // finished sources aren't the culprit
  });
});
