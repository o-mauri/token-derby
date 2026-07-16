import { describe, it, expect } from 'vitest';
import { SITE_VERSION, CLI_VERSION } from '../src/version.js';

describe('version constants', () => {
  it('fall back to "dev" when build-time define is absent (vitest)', () => {
    expect(SITE_VERSION).toBe('dev');
    expect(CLI_VERSION).toBe('dev');
  });
});
