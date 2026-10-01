import { vi } from 'vitest';

// Never let a test spawn a real browser. `login`, `link` and `web` all open the
// verification URL, and a suite that forgets to inject a fake opens a tab per
// test — 27 of them, in the case that made this necessary. Mocking the module
// here means a new test cannot reintroduce that by omission.
//
// The rest of the module is spread through rather than dropped: a factory
// listing only `spawn` makes any future `execFile`/`spawnSync` import in cli
// source fail at import time, in every cli test, with an error that names
// neither this file nor the new import.
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })),
}));
