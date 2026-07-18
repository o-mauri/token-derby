import { describe, it, expect } from 'vitest';
import { resolveApiBase, DEFAULT_CONFIG } from '../electron/config.js';

describe('config', () => {
  it('prefers override, else env default', () => {
    expect(resolveApiBase({ ...DEFAULT_CONFIG, env: 'staging', apiBaseOverride: null }))
      .toBe('https://token-derby-staging.mauricode.co.uk/api');
    expect(resolveApiBase({ ...DEFAULT_CONFIG, env: 'prod', apiBaseOverride: 'http://localhost:3000/api' }))
      .toBe('http://localhost:3000/api');
  });

  it('resolves prod default when no override is set', () => {
    expect(resolveApiBase({ ...DEFAULT_CONFIG, env: 'prod', apiBaseOverride: null }))
      .toBe('https://token-derby.mauricode.co.uk/api');
  });

  it('defaults to staging', () => {
    expect(DEFAULT_CONFIG.env).toBe('staging');
  });
});
