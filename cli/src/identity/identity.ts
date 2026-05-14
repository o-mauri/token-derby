import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { USER_NAME_MAX_LENGTH } from '@token-derby/shared';
import { identityFile, homeDir } from '../paths.js';

export type Identity = {
  user_id: string;
  display_name: string;
  created_at: string;
};

export async function loadIdentity(): Promise<Identity | null> {
  try {
    const raw = await fs.readFile(identityFile(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<Identity>;
    if (
      typeof parsed.user_id === 'string' &&
      typeof parsed.display_name === 'string' &&
      typeof parsed.created_at === 'string'
    ) {
      return parsed as Identity;
    }
    return null;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null;
    return null;
  }
}

export async function saveIdentity(identity: Identity): Promise<void> {
  await fs.mkdir(homeDir(), { recursive: true });
  await fs.writeFile(identityFile(), JSON.stringify(identity, null, 2) + '\n', 'utf8');
}

export function generateUserId(): string {
  return crypto.randomUUID();
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
