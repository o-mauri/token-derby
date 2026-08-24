import { vi } from 'vitest';

// Never let a test spawn a real browser. `login`, `link` and `web` all open the
// verification URL, and a suite that forgets to inject a fake opens a tab per
// test — 27 of them, in the case that made this necessary. Mocking the module
// here means a new test cannot reintroduce that by omission.
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })),
}));
