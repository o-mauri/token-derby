import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { apiBase, API_BASE } from '../src/config.js';
import { webOrigin } from '../src/commands/open-web.js';

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
  it('TOKEN_DERBY_API_BASE hard-overrides the built-in base', () => {
    process.env.TOKEN_DERBY_API_BASE = 'https://example.test/api';
    expect(apiBase()).toBe('https://example.test/api');
  });

  it('falls back to the production API base', () => {
    expect(apiBase()).toBe('https://api.tokenderby.co.uk');
  });

  it('API_BASE is the production API', () => {
    expect(API_BASE).toBe('https://api.tokenderby.co.uk');
  });
});

describe('webOrigin', () => {
  it('opens the production app by default', () => {
    expect(webOrigin()).toBe('https://app.tokenderby.co.uk');
  });

  it('follows an API override to its own site', () => {
    process.env.TOKEN_DERBY_API_BASE = 'http://localhost:3000/api';
    expect(webOrigin()).toBe('http://localhost:3000');
  });
});
