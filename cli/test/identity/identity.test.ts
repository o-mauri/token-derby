import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadIdentity,
  saveIdentity,
  deleteIdentity,
  validateDisplayName,
  type Identity,
} from '../../src/identity/identity.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-identity-'));
  process.env.TOKEN_DERBY_HOME = tmp;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('identity', () => {
  it('loadIdentity returns null when no file exists', async () => {
    const id = await loadIdentity();
    expect(id).toBeNull();
  });

  it('saveIdentity then loadIdentity round-trips, including secret_token', async () => {
    const id: Identity = {
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      display_name: 'Alice',
      secret_token: 'abc123_secret_token_xyz',
      created_at: '2026-05-14T10:00:00Z',
    };
    await saveIdentity(id);
    const loaded = await loadIdentity();
    expect(loaded).toEqual(id);
  });

  it('loadIdentity returns null on corrupt JSON', async () => {
    await fs.writeFile(path.join(tmp, 'identity.json'), '{not-json', 'utf8');
    expect(await loadIdentity()).toBeNull();
  });

  it('loadIdentity returns null on missing required fields', async () => {
    await fs.writeFile(path.join(tmp, 'identity.json'), JSON.stringify({ user_id: 'x' }), 'utf8');
    expect(await loadIdentity()).toBeNull();
  });

  it('loadIdentity rejects files missing secret_token', async () => {
    await fs.writeFile(path.join(tmp, 'identity.json'), JSON.stringify({
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      display_name: 'Alice',
      created_at: '2026-05-14T10:00:00Z',
    }), 'utf8');
    expect(await loadIdentity()).toBeNull();
  });

  it('deleteIdentity removes the file', async () => {
    await saveIdentity({
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      display_name: 'Alice',
      secret_token: 'secret',
      created_at: '2026-05-14T10:00:00Z',
    });
    await deleteIdentity();
    expect(await loadIdentity()).toBeNull();
  });

  it('deleteIdentity is a no-op when no file exists', async () => {
    await expect(deleteIdentity()).resolves.toBeUndefined();
  });
});

describe('validateDisplayName', () => {
  it('accepts a non-empty name within the limit', () => {
    expect(validateDisplayName('Alice')).toEqual({ ok: true, name: 'Alice' });
  });

  it('trims whitespace', () => {
    expect(validateDisplayName('  Alice  ')).toEqual({ ok: true, name: 'Alice' });
  });

  it('rejects empty strings', () => {
    const r = validateDisplayName('');
    expect(r.ok).toBe(false);
  });

  it('rejects whitespace-only', () => {
    const r = validateDisplayName('   ');
    expect(r.ok).toBe(false);
  });

  it('rejects names longer than 40 chars', () => {
    const r = validateDisplayName('x'.repeat(41));
    expect(r.ok).toBe(false);
  });

  it('accepts names exactly 40 chars', () => {
    const r = validateDisplayName('x'.repeat(40));
    expect(r).toEqual({ ok: true, name: 'x'.repeat(40) });
  });
});
