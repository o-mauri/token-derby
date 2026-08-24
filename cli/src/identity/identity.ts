import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { USER_NAME_MAX_LENGTH } from '@token-derby/shared';
import { identityFile, homeDir } from '../paths.js';

export type Identity = {
  user_id: string;
  display_name: string;
  secret_token: string;
  created_at: string;
};

/**
 * Whether identity.json exists, separately from whether it can be understood.
 * `loadIdentity` collapses both into null, which is fine for "can I make an
 * authenticated call" but not for anything that deletes the file.
 */
export type IdentityFileState =
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: string }
  | { kind: 'ok'; identity: Identity };

export async function readIdentityFile(): Promise<IdentityFileState> {
  let raw: string;
  try {
    raw = await fs.readFile(identityFile(), 'utf8');
  } catch (e: any) {
    if (e?.code === 'ENOENT') return { kind: 'missing' };
    return { kind: 'unreadable', reason: `could not be read (${e?.code ?? 'read error'})` };
  }
  let parsed: Partial<Identity>;
  try {
    parsed = JSON.parse(raw) as Partial<Identity>;
  } catch {
    return { kind: 'unreadable', reason: 'is not valid JSON' };
  }
  if (
    typeof parsed.user_id === 'string' &&
    typeof parsed.display_name === 'string' &&
    typeof parsed.secret_token === 'string' &&
    typeof parsed.created_at === 'string'
  ) {
    return { kind: 'ok', identity: parsed as Identity };
  }
  return { kind: 'unreadable', reason: 'is missing fields this version expects' };
}

export async function loadIdentity(): Promise<Identity | null> {
  const state = await readIdentityFile();
  return state.kind === 'ok' ? state.identity : null;
}

export async function saveIdentity(identity: Identity): Promise<void> {
  await fs.mkdir(homeDir(), { recursive: true });
  await fs.writeFile(identityFile(), JSON.stringify(identity, null, 2) + '\n', 'utf8');
}

export async function deleteIdentity(): Promise<void> {
  try {
    await fs.unlink(identityFile());
  } catch (e: any) {
    if (e?.code !== 'ENOENT') throw e;
  }
}

export function validateDisplayName(name: string): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = name.trim();
  if (trimmed.length < 1) return { ok: false, error: 'Name cannot be empty.' };
  if (trimmed.length > USER_NAME_MAX_LENGTH) {
    return { ok: false, error: `Name must be ${USER_NAME_MAX_LENGTH} characters or fewer.` };
  }
  return { ok: true, name: trimmed };
}

export function identityFilePath(): string {
  return identityFile();
}

export function identityFileDir(): string {
  return path.dirname(identityFile());
}
