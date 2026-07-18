import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_CONFIG, type Config } from '../electron/config.js';

// Real safeStorage isn't available outside the Electron runtime. Stub it with
// a reversible (base64) transform so store()/load() can round-trip for real.
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(plain, 'utf8'),
    decryptString: (buf: Buffer) => buf.toString('utf8'),
  },
}));

const { load, store, signOut, importFromCli } = await import('../electron/identity.js');

let homeTmp: string;
let cliTmp: string;

beforeEach(async () => {
  homeTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-desktop-home-'));
  cliTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-cli-home-'));
  process.env.TOKEN_DERBY_BASE = cliTmp;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_BASE;
  await fs.rm(homeTmp, { recursive: true, force: true });
  await fs.rm(cliTmp, { recursive: true, force: true });
});

function cfg(overrides: Partial<Config> = {}): Config {
  return { ...DEFAULT_CONFIG, homeOverride: homeTmp, ...overrides };
}

describe('identity', () => {
  it('load returns null when no file exists', async () => {
    expect(await load(cfg())).toBeNull();
  });

  it('store then load round-trips the identity', async () => {
    const identity = { user_id: 'u1', display_name: 'Alice', secret_token: 'sekret' };
    await store(cfg(), identity);
    expect(await load(cfg())).toEqual(identity);
  });

  it('keeps prod and staging identities separate', async () => {
    const prodId = { user_id: 'p1', display_name: 'Prod Alice', secret_token: 'prod-secret' };
    const stagingId = { user_id: 's1', display_name: 'Staging Alice', secret_token: 'staging-secret' };
    await store(cfg({ env: 'prod' }), prodId);
    await store(cfg({ env: 'staging' }), stagingId);

    expect(await load(cfg({ env: 'prod' }))).toEqual(prodId);
    expect(await load(cfg({ env: 'staging' }))).toEqual(stagingId);
  });

  it('signOut deletes the stored identity', async () => {
    await store(cfg(), { user_id: 'u1', display_name: 'Alice', secret_token: 'sekret' });
    await signOut(cfg());
    expect(await load(cfg())).toBeNull();
  });

  it('signOut is a no-op when nothing is stored', async () => {
    await expect(signOut(cfg())).resolves.toBeUndefined();
  });

  it('load returns null for a corrupt/undecryptable blob', async () => {
    const c = cfg();
    await fs.mkdir(homeTmp, { recursive: true });
    await fs.writeFile(path.join(homeTmp, `identity-${c.env}.enc`), 'not json at all');
    expect(await load(c)).toBeNull();
  });

  it('importFromCli reads ~/.token-derby/identity.json and returns the identity', async () => {
    const cliIdentity = {
      user_id: 'cli-user-1',
      display_name: 'Cliff',
      secret_token: 'cli-secret',
      created_at: '2026-01-01T00:00:00Z',
    };
    await fs.mkdir(path.join(cliTmp, '.token-derby'), { recursive: true });
    await fs.writeFile(
      path.join(cliTmp, '.token-derby', 'identity.json'),
      JSON.stringify(cliIdentity),
      'utf8',
    );

    const imported = await importFromCli(cfg({ env: 'prod' }));

    expect(imported).toEqual({ user_id: 'cli-user-1', display_name: 'Cliff', secret_token: 'cli-secret' });
  });

  it('importFromCli reads the staging identity file when env is staging', async () => {
    const cliIdentity = {
      user_id: 'cli-user-2',
      display_name: 'Stagey',
      secret_token: 'staging-cli-secret',
      created_at: '2026-01-01T00:00:00Z',
    };
    await fs.mkdir(path.join(cliTmp, '.token-derby-staging'), { recursive: true });
    await fs.writeFile(
      path.join(cliTmp, '.token-derby-staging', 'identity.json'),
      JSON.stringify(cliIdentity),
      'utf8',
    );

    const imported = await importFromCli(cfg({ env: 'staging' }));

    expect(imported.user_id).toBe('cli-user-2');
  });

  it('importFromCli also persists the identity so a subsequent load() finds it', async () => {
    const cliIdentity = {
      user_id: 'cli-user-3',
      display_name: 'Persisted',
      secret_token: 'sek',
      created_at: '2026-01-01T00:00:00Z',
    };
    await fs.mkdir(path.join(cliTmp, '.token-derby'), { recursive: true });
    await fs.writeFile(
      path.join(cliTmp, '.token-derby', 'identity.json'),
      JSON.stringify(cliIdentity),
      'utf8',
    );

    const c = cfg({ env: 'prod' });
    await importFromCli(c);

    expect(await load(c)).toEqual({ user_id: 'cli-user-3', display_name: 'Persisted', secret_token: 'sek' });
  });

  it('importFromCli rejects a CLI identity file missing required fields', async () => {
    await fs.mkdir(path.join(cliTmp, '.token-derby'), { recursive: true });
    await fs.writeFile(path.join(cliTmp, '.token-derby', 'identity.json'), JSON.stringify({ user_id: 'x' }), 'utf8');

    await expect(importFromCli(cfg({ env: 'prod' }))).rejects.toThrow();
  });
});
