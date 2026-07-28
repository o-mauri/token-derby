import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scanWithTimeout, isStall, type AllSources, type StallReading } from '../../src/tokens/race-tokens.js';
import { HEARTBEAT_INTERVAL_MS, SCAN_TIMEOUT_MS } from '../../src/config.js';

function reading(): AllSources {
  return { secondary: { claude: 0, codex: 0, gemini: 0 }, primaryByConv: new Map() };
}

describe('SCAN_TIMEOUT_MS', () => {
  it('gives a scan most of the heartbeat interval without overrunning the next beat', () => {
    expect(SCAN_TIMEOUT_MS).toBeGreaterThan(HEARTBEAT_INTERVAL_MS / 2);
    expect(SCAN_TIMEOUT_MS).toBeLessThan(HEARTBEAT_INTERVAL_MS);
  });
});

describe('scanWithTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the reading when the scan finishes inside the budget', async () => {
    const p = scanWithTimeout(() => new Promise<AllSources>(r => setTimeout(() => r(reading()), 11_700)), 45_000);
    await vi.advanceTimersByTimeAsync(11_700);
    expect(isStall(await p)).toBe(false);
  });

  it('stalls when the scan exceeds the budget', async () => {
    const p = scanWithTimeout(() => new Promise<AllSources>(r => setTimeout(() => r(reading()), 90_000)), 45_000);
    await vi.advanceTimersByTimeAsync(45_000);
    const res = await p;
    expect(isStall(res)).toBe(true);
    expect((res as StallReading).stall).toMatch(/timed out/i);
  });

  it('uses the caller-supplied diagnosis for the stall text', async () => {
    const p = scanWithTimeout(
      () => new Promise<AllSources>(() => {}), // never settles
      45_000,
      async () => 'Token scan timed out after 45s — codex (2.0 GB) still scanning',
    );
    await vi.advanceTimersByTimeAsync(45_000);
    expect((await p as StallReading).stall).toContain('codex (2.0 GB)');
  });

  it('clears the budget timer once the scan wins, so it cannot hold the process open', async () => {
    await scanWithTimeout(async () => reading(), 45_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
