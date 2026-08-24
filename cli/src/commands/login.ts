import { spawn } from 'node:child_process';
import * as os from 'node:os';
import type { CliAuthPollApprovedResponse } from '@token-derby/shared';
import {
  saveIdentity as saveIdentityDefault,
  loadIdentity as loadIdentityDefault,
  type Identity,
} from '../identity/identity.js';
import { opener } from './web.js';
import { cliAuthStart, cliAuthPoll, revokeDevice, createWebSession } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { promptYesNo as promptYesNoDefault } from '../ui/prompt.js';

export type LoginDeps = {
  apiStart?: typeof cliAuthStart;
  apiPoll?: typeof cliAuthPoll;
  apiRevokeDevice?: typeof revokeDevice;
  apiCreateWebSession?: typeof createWebSession;
  saveIdentity?: typeof saveIdentityDefault;
  loadIdentity?: typeof loadIdentityDefault;
  promptText?: (question: string) => Promise<string>;
  promptYesNo?: (question: string) => Promise<boolean>;
  sleepImpl?: (ms: number) => Promise<void>;
  isTTY?: boolean;
  spawnImpl?: typeof spawn;
  hostname?: () => string;
};

/** Parses `--device-name <name>` or `--device-name=<name>` out of the argv passed to `login`. */
export function parseDeviceNameFlag(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--device-name') return argv[i + 1] ?? null;
    if (a.startsWith('--device-name=')) return a.slice('--device-name='.length);
  }
  return null;
}

async function defaultPromptText(question: string): Promise<string> {
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves the device name: --device-name wins outright; otherwise a TTY gets
 * prompted with the hostname pre-filled as the default (empty answer keeps
 * it); a non-TTY (SSH without a terminal, CI) falls straight back to the
 * hostname rather than blocking on a prompt nothing will ever answer.
 */
async function resolveDeviceName(
  flagName: string | null,
  isTTY: boolean,
  hostname: string,
  promptText: (question: string) => Promise<string>,
): Promise<string> {
  if (flagName) return flagName;
  if (!isTTY) return hostname;
  const answer = (await promptText(`Device name [${hostname}]: `)).trim();
  return answer || hostname;
}

export async function loginCommand(argv: string[] = [], deps: LoginDeps = {}): Promise<number> {
  const apiStart = deps.apiStart ?? cliAuthStart;
  const apiPoll = deps.apiPoll ?? cliAuthPoll;
  const apiRevokeDevice = deps.apiRevokeDevice ?? revokeDevice;
  const apiCreateWebSession = deps.apiCreateWebSession ?? createWebSession;
  const saveIdentity = deps.saveIdentity ?? saveIdentityDefault;
  const loadIdentity = deps.loadIdentity ?? loadIdentityDefault;
  const promptText = deps.promptText ?? defaultPromptText;
  const promptYesNo = deps.promptYesNo ?? promptYesNoDefault;
  const sleepImpl = deps.sleepImpl ?? defaultSleep;
  const isTTY = deps.isTTY ?? Boolean(process.stdin.isTTY);
  const spawnImpl = deps.spawnImpl ?? spawn;
  const hostname = deps.hostname ?? (() => os.hostname());

  // A second login on the same box mints a second device credential, usually
  // with the same hostname label. identity.json only ever holds the newest, so
  // `logout` retires that one and the earlier row stays valid until it is
  // revoked by hand — say so before spending the code rather than after.
  const existing = await loadIdentity();
  if (existing) {
    console.log('');
    console.log(`  This machine is already signed in as ${existing.display_name}.`);
    console.log('  Signing in again adds a second credential; the current one stays active');
    console.log('  until you revoke it under Account in the org manager (`token-derby web`).');
    if (isTTY) {
      if (!await promptYesNo('  Sign in again anyway? [Y/n] ')) {
        console.log('Login cancelled.');
        return 0;
      }
    } else {
      console.log('  No TTY to confirm — continuing (equivalent to answering Y).');
    }
  }

  let label = await resolveDeviceName(parseDeviceNameFlag(argv), isTTY, hostname(), promptText);

  let start: Awaited<ReturnType<typeof apiStart>>;
  for (;;) {
    try {
      start = await apiStart({ label });
      break;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'BAD_REQUEST') {
        console.error(`Error: ${e.message}`);
        // The server rejects control/invisible characters in a label rather
        // than silently stripping them — that only makes sense if the person
        // typing it gets a chance to pick a different one.
        if (!isTTY) return 1;
        const retry = (await promptText('Enter a different device name: ')).trim();
        if (!retry) {
          console.error('Device name cannot be empty.');
          return 1;
        }
        label = retry;
        continue;
      }
      if (e instanceof ApiError) {
        console.error(`Error: ${e.code} ${e.message}`);
        return 1;
      }
      throw e;
    }
  }

  // A local identity mints a grant so the browser arrives already signed in.
  // With no local identity there is no credential to mint from, so the bare
  // URL stays untouched.
  let verificationUrl = start.verification_uri;
  let hasGrant = false;
  if (existing) {
    try {
      const grant = await apiCreateWebSession();
      verificationUrl = `${start.verification_uri}#code=${grant.code}`;
      hasGrant = true;
    } catch (e) {
      // A credential the server rejects has no jockey to link to — `/start`
      // ignored it too, so the pending request carries no link target and the
      // bare URL is the right path. Only other failures are worth aborting on.
      if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') {
        console.log('');
        console.log('  The credential stored on this machine is no longer valid (it may have been');
        console.log('  revoked), so this will sign you in fresh in the browser.');
      } else if (e instanceof ApiError) {
        console.error(`Error: ${e.code} ${e.message}`);
        return 1;
      } else {
        throw e;
      }
    }
  }

  console.log('');
  console.log('  To finish signing in, visit:');
  console.log(`    ${verificationUrl}`);
  if (hasGrant) {
    console.log('    That link signs the browser in for you and expires in 60 seconds — if it');
    console.log('    does, run `token-derby login` again for a fresh one.');
  }
  console.log('');
  console.log('  And enter this code:');
  console.log(`    ${start.user_code}`);
  console.log('');
  console.log('  Waiting for approval...');

  // Open it rather than making the reader copy it. When a grant was minted the
  // URL carries a 60-second window, and copying by hand is the likeliest way to
  // miss it. The printed URL remains the fallback.
  const cmd = opener();
  if (cmd) {
    try {
      const child = spawnImpl(cmd, [verificationUrl], { stdio: 'ignore', detached: true });
      child.on('error', () => { /* headless / no opener — the printed URL is the fallback */ });
      child.unref();
    } catch {
      // ignore — URL already printed
    }
  }

  const deadline = Date.now() + start.expires_in * 1000;
  let approved: CliAuthPollApprovedResponse | null = null;
  while (!approved) {
    let poll: Awaited<ReturnType<typeof apiPoll>>;
    try {
      poll = await apiPoll({ device_code: start.device_code });
    } catch (e) {
      if (e instanceof ApiError) {
        console.error(`Error: ${e.code} ${e.message}`);
        return 1;
      }
      throw e;
    }
    if (poll.status === 'approved') {
      approved = poll;
      break;
    }
    if (Date.now() >= deadline) {
      console.error('Login timed out waiting for approval. Run `token-derby login` again.');
      return 1;
    }
    await sleepImpl(start.interval * 1000);
  }

  console.log('');
  if (approved.email) console.log(`  ✓ Signed in as ${approved.email}`);
  console.log(
    `    Linking to your existing jockey: ${approved.display_name} (${approved.horses} horses, ${approved.orgs} orgs)`,
  );
  // A human already proved intent once, out of band, by approving in the
  // browser. With no TTY to ask again, take the prompt's own default (yes)
  // rather than block forever on a question nothing can answer — but say so,
  // so a CI log doesn't read as though nobody asked.
  let proceed: boolean;
  if (isTTY) {
    proceed = await promptYesNo('    Link this account? [Y/n] ');
  } else {
    console.log('    No TTY to confirm — proceeding automatically (equivalent to answering Y).');
    proceed = true;
  }

  if (!proceed) {
    try {
      await apiRevokeDevice(approved.device_id, { user_id: approved.user_id, secret_token: approved.secret_token });
    } catch (e) {
      console.error('Declined, but could not revoke the device credential on the server.');
      if (e instanceof ApiError) console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    console.log('Login cancelled.');
    return 0;
  }

  const identity: Identity = {
    user_id: approved.user_id,
    display_name: approved.display_name,
    secret_token: approved.secret_token,
    created_at: new Date().toISOString(),
  };
  await saveIdentity(identity);
  console.log('');
  console.log(`Welcome back, ${identity.display_name}!`);
  return 0;
}
