import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { apiBase, ENVIRONMENTS } from '../src/config.js';
import { setSelectedEnv } from '../src/env/env.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-config-'));
  process.env.TOKEN_DERBY_BASE = tmp;
  delete process.env.TOKEN_DERBY_API_BASE;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_BASE;
  delete process.env.TOKEN_DERBY_API_BASE;
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('apiBase precedence', () => {
  it('TOKEN_DERBY_API_BASE hard-overrides regardless of env', () => {
    process.env.TOKEN_DERBY_API_BASE = 'https://example.test/api';
    setSelectedEnv('staging');
    expect(apiBase()).toBe('https://example.test/api');
  });

  it('prod env resolves to the production API base', () => {
    setSelectedEnv('prod');
    expect(apiBase()).toBe('https://token-derby.mauricode.co.uk/api');
  });

  it('staging env resolves to the staging API base', () => {
    setSelectedEnv('staging');
    expect(apiBase()).toBe('https://token-derby-staging.mauricode.co.uk/api');
  });

  it('defaults to prod API base when no pointer exists', () => {
    expect(apiBase()).toBe('https://token-derby.mauricode.co.uk/api');
  });

  it('ENVIRONMENTS maps both envs', () => {
    expect(ENVIRONMENTS.prod.apiBase).toBe('https://token-derby.mauricode.co.uk/api');
    expect(ENVIRONMENTS.staging.apiBase).toBe('https://token-derby-staging.mauricode.co.uk/api');
  });
});
