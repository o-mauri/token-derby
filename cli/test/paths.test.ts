import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { homeDir, identityFile, piSessionsDir } from '../src/paths.js';
import { setSelectedEnv } from '../src/env/env.js';
import { deleteIdentity } from '../src/identity/identity.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-paths-'));
  process.env.TOKEN_DERBY_BASE = tmp;
  delete process.env.TOKEN_DERBY_HOME;
  delete process.env.TOKEN_DERBY_PI_DIR;
  delete process.env.PI_CODING_AGENT_SESSION_DIR;
  delete process.env.PI_CODING_AGENT_DIR;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_BASE;
  delete process.env.TOKEN_DERBY_HOME;
  delete process.env.TOKEN_DERBY_PI_DIR;
  delete process.env.PI_CODING_AGENT_SESSION_DIR;
  delete process.env.PI_CODING_AGENT_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('homeDir precedence', () => {
  it('TOKEN_DERBY_HOME hard-overrides regardless of env', () => {
    process.env.TOKEN_DERBY_HOME = '/custom/home';
    setSelectedEnv('staging');
    expect(homeDir()).toBe('/custom/home');
  });

  it('prod env resolves to <base>/.token-derby', () => {
    setSelectedEnv('prod');
    expect(homeDir()).toBe(path.join(tmp, '.token-derby'));
  });

  it('staging env resolves to <base>/.token-derby-staging', () => {
    setSelectedEnv('staging');
    expect(homeDir()).toBe(path.join(tmp, '.token-derby-staging'));
  });
});

describe('Pi session path precedence', () => {
  it('prefers the Token Derby override, then Pi session/config overrides', () => {
    process.env.PI_CODING_AGENT_DIR = '/pi-agent';
    expect(piSessionsDir()).toBe('/pi-agent/sessions');
    process.env.PI_CODING_AGENT_SESSION_DIR = '/pi-sessions';
    expect(piSessionsDir()).toBe('/pi-sessions');
    process.env.TOKEN_DERBY_PI_DIR = '/token-derby-pi';
    expect(piSessionsDir()).toBe('/token-derby-pi');
  });
});

describe('prod-token safety', () => {
  it('deleting the identity under staging leaves the prod identity untouched', async () => {
    // Seed a prod identity file directly at the prod path.
    const prodDir = path.join(tmp, '.token-derby');
    fsSync.mkdirSync(prodDir, { recursive: true });
    const prodIdentity = path.join(prodDir, 'identity.json');
    fsSync.writeFileSync(prodIdentity, JSON.stringify({
      user_id: 'prod-user', display_name: 'Prod', secret_token: 'PROD_SECRET', created_at: '2026-01-01T00:00:00Z',
    }), 'utf8');

    // Seed a staging identity, then switch to staging and delete it.
    setSelectedEnv('staging');
    const stagingDir = path.join(tmp, '.token-derby-staging');
    fsSync.mkdirSync(stagingDir, { recursive: true });
    fsSync.writeFileSync(path.join(stagingDir, 'identity.json'), JSON.stringify({
      user_id: 'stg-user', display_name: 'Stg', secret_token: 'STG_SECRET', created_at: '2026-01-01T00:00:00Z',
    }), 'utf8');

    expect(identityFile()).toBe(path.join(stagingDir, 'identity.json'));
    await deleteIdentity();

    // Staging identity gone, prod identity + its secret token intact.
    expect(fsSync.existsSync(path.join(stagingDir, 'identity.json'))).toBe(false);
    expect(fsSync.existsSync(prodIdentity)).toBe(true);
    expect(fsSync.readFileSync(prodIdentity, 'utf8')).toContain('PROD_SECRET');
  });
});
