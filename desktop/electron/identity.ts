import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { safeStorage } from 'electron';
import { homeDirFor, type Config } from './config.js';

// What the desktop app needs to authenticate — a subset of the CLI's
// identity.json shape (see cli/src/identity/identity.ts).
export type Identity = {
  user_id: string;
  display_name: string;
  secret_token: string;
};

function identityFilePath(cfg: Config): string {
  return path.join(homeDirFor(cfg), `identity-${cfg.env}.enc`);
}

function isValidIdentity(v: unknown): v is Identity {
  const p = v as Partial<Identity> | null;
  return (
    !!p &&
    typeof p.user_id === 'string' &&
    typeof p.display_name === 'string' &&
    typeof p.secret_token === 'string'
  );
}

export async function load(cfg: Config): Promise<Identity | null> {
  let buf: Buffer;
  try {
    buf = await fs.readFile(identityFilePath(cfg));
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null;
    return null;
  }
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const json = safeStorage.decryptString(buf);
    const parsed = JSON.parse(json) as unknown;
    return isValidIdentity(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function store(cfg: Config, identity: Identity): Promise<void> {
  const dir = homeDirFor(cfg);
  await fs.mkdir(dir, { recursive: true });
  const encrypted = safeStorage.encryptString(JSON.stringify(identity));
  await fs.writeFile(identityFilePath(cfg), encrypted);
}

export async function signOut(cfg: Config): Promise<void> {
  try {
    await fs.unlink(identityFilePath(cfg));
  } catch (e: any) {
    if (e?.code !== 'ENOENT') throw e;
  }
}

// The CLI's identity file is plaintext JSON at ~/.token-derby[-staging]/identity.json
// (see cli/src/paths.ts). Shape per cli/src/identity/identity.ts.
type CliIdentity = {
  user_id: string;
  display_name: string;
  secret_token: string;
  created_at: string;
};

function isValidCliIdentity(v: unknown): v is CliIdentity {
  const p = v as Partial<CliIdentity> | null;
  return (
    !!p &&
    typeof p.user_id === 'string' &&
    typeof p.display_name === 'string' &&
    typeof p.secret_token === 'string' &&
    typeof p.created_at === 'string'
  );
}

// Same TOKEN_DERBY_BASE override the CLI itself honors (cli/src/env/env.ts),
// so pointing the CLI at a test/dev home also repoints this import.
function cliBaseDir(): string {
  return process.env.TOKEN_DERBY_BASE ?? os.homedir();
}

function cliIdentityFilePath(cfg: Config): string {
  const dir = cfg.env === 'staging' ? '.token-derby-staging' : '.token-derby';
  return path.join(cliBaseDir(), dir, 'identity.json');
}

export async function importFromCli(cfg: Config): Promise<Identity> {
  const raw = await fs.readFile(cliIdentityFilePath(cfg), 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!isValidCliIdentity(parsed)) {
    throw new Error('CLI identity file is missing required fields');
  }
  const identity: Identity = {
    user_id: parsed.user_id,
    display_name: parsed.display_name,
    secret_token: parsed.secret_token,
  };
  await store(cfg, identity);
  return identity;
}

// Builds an identity from a pasted "<user_id>:<secret_token>" pair, resolving
// display_name from the server via the injected `fetchJockey` (kept as an
// injected dependency so this module never needs to import the transport).
export async function pasteToken(
  cfg: Config,
  pasted: string,
  fetchJockey: (identity: { user_id: string; secret_token: string }) => Promise<{ display_name: string }>,
): Promise<Identity> {
  const [user_id, secret_token] = pasted.split(':');
  if (!user_id || !secret_token) {
    throw new Error('Invalid pasted identity — expected "<user_id>:<secret_token>"');
  }
  const jockey = await fetchJockey({ user_id, secret_token });
  const identity: Identity = { user_id, display_name: jockey.display_name, secret_token };
  await store(cfg, identity);
  return identity;
}
