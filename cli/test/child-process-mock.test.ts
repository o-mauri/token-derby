import { describe, it, expect, vi } from 'vitest';
import { spawn, execFile, spawnSync } from 'node:child_process';

// Guards the shape of the global mock in test/setup.ts, not any command. The
// mock is what stops a test opening a real browser tab, and a factory that
// listed `spawn` alone would break every cli test at import the day cli source
// imports anything else from this module.
describe('the global node:child_process mock', () => {
  it('replaces spawn, so nothing in a test can open a real browser', () => {
    expect(vi.isMockFunction(spawn)).toBe(true);
    const child = spawn('open', ['https://example.test']) as unknown as {
      on: unknown; unref: unknown;
    };
    // The stub every caller in cli source uses: attach an error handler, unref.
    expect(typeof child.on).toBe('function');
    expect(typeof child.unref).toBe('function');
  });

  it('leaves the rest of the module real, so a new import cannot break the suite', () => {
    // Imported above: with a mock that dropped these, this file would fail to
    // load at all rather than reach these assertions.
    expect(vi.isMockFunction(execFile)).toBe(false);
    expect(typeof execFile).toBe('function');
    expect(typeof spawnSync).toBe('function');
  });
});
