import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadIdentity,
  readIdentityFile,
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

  // Anything that deletes the file needs to tell "no file" apart from "a file
  // I could not understand" — loadIdentity collapses both to null.
  describe('readIdentityFile', () => {
    it('reports a missing file as missing', async () => {
      expect(await readIdentityFile()).toEqual({ kind: 'missing' });
    });

    it('reports corrupt JSON as unreadable, not missing', async () => {
      await fs.writeFile(path.join(tmp, 'identity.json'), '{not-json', 'utf8');
      const state = await readIdentityFile();
      expect(state.kind).toBe('unreadable');
      expect(state.kind === 'unreadable' && state.reason).toMatch(/JSON/);
    });

    it('reports an older shape as unreadable, not missing', async () => {
      await fs.writeFile(path.join(tmp, 'identity.json'), JSON.stringify({
        user_id: 'x', display_name: 'Alice', secret_token: 's',
      }), 'utf8');
      const state = await readIdentityFile();
      expect(state.kind).toBe('unreadable');
      expect(state.kind === 'unreadable' && state.reason).toMatch(/fields/);
    });

    it('reports an object with no secret_token key as holding no credential', async () => {
      // A genuinely old file: it has a created_at, so it is not garbage, and no
      // token anywhere in it, so there is nothing for `init` to destroy.
      await fs.writeFile(path.join(tmp, 'identity.json'), JSON.stringify({
        user_id: 'x', display_name: 'Alice', created_at: 'now',
      }), 'utf8');
      const state = await readIdentityFile();
      expect(state.kind).toBe('no-credential');
      expect(state.kind === 'no-credential' && state.reason).toMatch(/no credential/);
    });

    it('reports an empty object as holding no credential', async () => {
      await fs.writeFile(path.join(tmp, 'identity.json'), '{}', 'utf8');
      expect((await readIdentityFile()).kind).toBe('no-credential');
    });

    it('keeps a present-but-wrong-typed secret_token unreadable', async () => {
      // The key is there, so something may have written a credential in a shape
      // this version cannot read — the case that must never be overwritten.
      await fs.writeFile(path.join(tmp, 'identity.json'), JSON.stringify({
        user_id: 'x', display_name: 'Alice', created_at: 'now', secret_token: 12345,
      }), 'utf8');
      expect((await readIdentityFile()).kind).toBe('unreadable');
    });

    it('keeps a non-object JSON file unreadable rather than credential-free', async () => {
      // `42` has no secret_token either, but nothing about it says it was ever
      // an identity file, so it gets the cautious answer.
      await fs.writeFile(path.join(tmp, 'identity.json'), '42', 'utf8');
      expect((await readIdentityFile()).kind).toBe('unreadable');
      await fs.writeFile(path.join(tmp, 'identity.json'), 'null', 'utf8');
      expect((await readIdentityFile()).kind).toBe('unreadable');
      await fs.writeFile(path.join(tmp, 'identity.json'), '[]', 'utf8');
      expect((await readIdentityFile()).kind).toBe('unreadable');
    });

    it('loadIdentity still reads a credential-free file as no identity', async () => {
      await fs.writeFile(path.join(tmp, 'identity.json'), JSON.stringify({
        user_id: 'x', display_name: 'Alice', created_at: 'now',
      }), 'utf8');
      // Nothing can authenticate with it, so every caller that just wants a
      // credential must still see nothing.
      expect(await loadIdentity()).toBeNull();
    });

    it('reports an unreadable-on-disk file as unreadable, naming the errno', async () => {
      const file = path.join(tmp, 'identity.json');
      await fs.writeFile(file, JSON.stringify({
        user_id: 'x', display_name: 'Alice', secret_token: 's', created_at: 'now',
      }), 'utf8');
      await fs.chmod(file, 0o000);
      try {
        const state = await readIdentityFile();
        expect(state.kind).toBe('unreadable');
        expect(state.kind === 'unreadable' && state.reason).toContain('EACCES');
      } finally {
        await fs.chmod(file, 0o600);
      }
    });

    it('returns the identity when the file is intact', async () => {
      const id: Identity = {
        user_id: '550e8400-e29b-41d4-a716-446655440000',
        display_name: 'Alice',
        secret_token: 'secret',
        created_at: '2026-05-14T10:00:00Z',
      };
      await saveIdentity(id);
      expect(await readIdentityFile()).toEqual({ kind: 'ok', identity: id });
    });
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
