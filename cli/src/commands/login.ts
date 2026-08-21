import * as os from 'node:os';
import type { CliAuthPollApprovedResponse } from '@token-derby/shared';
import { saveIdentity as saveIdentityDefault, type Identity } from '../identity/identity.js';
import { cliAuthStart, cliAuthPoll, revokeDevice } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { promptYesNo as promptYesNoDefault } from '../ui/prompt.js';

export type LoginDeps = {
  apiStart?: typeof cliAuthStart;
  apiPoll?: typeof cliAuthPoll;
  apiRevokeDevice?: typeof revokeDevice;
  saveIdentity?: typeof saveIdentityDefault;
  promptText?: (question: string) => Promise<string>;
  promptYesNo?: (question: string) => Promise<boolean>;
  sleepImpl?: (ms: number) => Promise<void>;
  isTTY?: boolean;
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
  const saveIdentity = deps.saveIdentity ?? saveIdentityDefault;
  const promptText = deps.promptText ?? defaultPromptText;
  const promptYesNo = deps.promptYesNo ?? promptYesNoDefault;
  const sleepImpl = deps.sleepImpl ?? defaultSleep;
  const isTTY = deps.isTTY ?? Boolean(process.stdin.isTTY);
  const hostname = deps.hostname ?? (() => os.hostname());

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

  console.log('');
  console.log('  To finish signing in, visit:');
  console.log(`    ${start.verification_uri}`);
  console.log('');
  console.log('  And enter this code:');
  console.log(`    ${start.user_code}`);
  console.log('');
  console.log('  Waiting for approval...');

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
