import { spawn } from 'node:child_process';
import * as os from 'node:os';
import { getJockey, createWebSession, registerDevice } from '../api/endpoints.js';
import { webOrigin, opener } from './web.js';
import { ApiError } from '../api/client.js';
import { parseDeviceNameFlag, resolveDeviceName } from './login.js';
import {
  loadIdentity as loadIdentityDefault,
  saveIdentity as saveIdentityDefault,
} from '../identity/identity.js';
import { CREDENTIAL_DEAD_MESSAGE } from '../ui/messages.js';

export type LinkDeps = {
  apiGetJockey?: typeof getJockey;
  apiCreateWebSession?: typeof createWebSession;
  apiRegisterDevice?: typeof registerDevice;
  loadIdentity?: typeof loadIdentityDefault;
  saveIdentity?: typeof saveIdentityDefault;
  spawnImpl?: typeof spawn;
  sleepImpl?: (ms: number) => Promise<void>;
  promptText?: (question: string) => Promise<string>;
  isTTY?: boolean;
  hostname?: () => string;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// How often to re-check for an email while waiting.
const POLL_INTERVAL_MS = 2_000;
// The grant itself expires in 60s, but the Google consent screen after
// redemption takes as long as the human in front of it takes — bound the
// wait generously so an abandoned browser fails honestly instead of
// spinning forever.
const WAIT_TIMEOUT_MS = 5 * 60 * 1_000;

export async function linkCommand(argv: string[] = [], deps: LinkDeps = {}): Promise<number> {
  const apiGetJockey = deps.apiGetJockey ?? getJockey;
  const apiCreateWebSession = deps.apiCreateWebSession ?? createWebSession;
  const apiRegisterDevice = deps.apiRegisterDevice ?? registerDevice;
  const loadIdentity = deps.loadIdentity ?? loadIdentityDefault;
  const saveIdentity = deps.saveIdentity ?? saveIdentityDefault;
  const spawnImpl = deps.spawnImpl ?? spawn;
  const sleepImpl = deps.sleepImpl ?? defaultSleep;
  const promptText = deps.promptText ?? defaultPromptText;
  const isTTY = deps.isTTY ?? Boolean(process.stdin.isTTY);
  const hostname = deps.hostname ?? (() => os.hostname());

  // The server renames the jockey to the Google first name on a first link, so
  // identity.json goes stale unless it is rewritten from what the server
  // reports afterwards. Everything local reads its name from that file.
  const syncLocalName = async (serverName: string): Promise<void> => {
    const local = await loadIdentity();
    if (!local || local.display_name === serverName) return;
    await saveIdentity({ ...local, display_name: serverName });
  };

  /**
   * The second half of the migration. A machine that got here was authenticating
   * with the account-level credential: shared by every machine on the account,
   * not revocable one machine at a time, and rotating it would kill the others.
   * Register this machine and put its own credential in identity.json instead.
   *
   * The link has already succeeded by the time this runs, so nothing in here is
   * allowed to fail the command or undo it — the worst case is being told to run
   * `token-derby login`, which reaches the same end state.
   */
  const registerThisMachine = async (serverName: string): Promise<void> => {
    const local = await loadIdentity();
    if (!local) {
      // Nothing on disk for a credential to live in, so minting one would
      // strand a device row the user can see but no machine can use.
      console.log('  This machine has no local identity file, so it was not registered as a');
      console.log('  device. Run `token-derby login` to give it its own credential.');
      return;
    }
    const named = local.display_name === serverName ? local : { ...local, display_name: serverName };

    let label: string;
    try {
      label = await resolveDeviceName(parseDeviceNameFlag(argv), isTTY, hostname(), promptText);
      const registered = await apiRegisterDevice({ label });
      await saveIdentity({ ...named, secret_token: registered.secret_token });
    } catch (e) {
      // The name sync still has to land: it is the only reason this command
      // touched identity.json before device credentials existed.
      try {
        if (named !== local) await saveIdentity(named);
      } catch {
        // A failed write is not worth a second error on top of the one below,
        // which already tells the reader what state they are in and what to run.
      }
      console.log('');
      console.log('  Your account is linked — that part is done and does not need repeating.');
      console.log('  Registering this machine as a device did not complete, so it is still');
      console.log('  using the shared account credential. Run `token-derby login` to finish.');
      // Reported for every failure, not just ApiError: an unexpected throw
      // swallowed silently here would look like the server refused.
      console.error(`  Error: ${e instanceof ApiError ? `${e.code} ${e.message}` : String(e)}`);
      return;
    }

    console.log(`  This machine is now registered as "${label}", with a credential of its own`);
    console.log('  that you can revoke separately under Account in the org manager.');
  };

  let me: Awaited<ReturnType<typeof apiGetJockey>>;
  try {
    me = await apiGetJockey();
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'UNAUTHENTICATED') {
        console.error(CREDENTIAL_DEAD_MESSAGE);
        return 1;
      }
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }

  if (me.email) {
    console.log(`Already linked to ${me.email}.`);
    // Deliberately no registration here: this branch does no work the user
    // asked for, and quietly minting a credential every time somebody re-runs
    // `link` would leave a pile of device rows to revoke by hand.
    await syncLocalName(me.display_name);
    return 0;
  }

  let code: string;
  try {
    ({ code } = await apiCreateWebSession());
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }

  const url = `${webOrigin()}/link#code=${code}`;
  console.log('');
  console.log('  Opening the Google link page in your browser...');
  console.log(`  ${url}`);
  console.log('');
  console.log('  If it doesn\'t open, copy the link above. It expires in 60 seconds.');

  const cmd = opener();
  if (cmd) {
    try {
      const child = spawnImpl(cmd, [url], { stdio: 'ignore', detached: true });
      child.on('error', () => { /* headless / no opener — the printed URL is the fallback */ });
      child.unref();
    } catch {
      // ignore — URL already printed
    }
  }

  console.log('');
  console.log('  Waiting for you to finish connecting with Google...');

  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    let poll: Awaited<ReturnType<typeof apiGetJockey>>;
    try {
      poll = await apiGetJockey();
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'UNAUTHENTICATED') {
          console.error(CREDENTIAL_DEAD_MESSAGE);
          return 1;
        }
        console.error(`Error: ${e.code} ${e.message}`);
        return 1;
      }
      throw e;
    }
    if (poll.email) {
      console.log(`✓ Linked to ${poll.email}.`);
      if (poll.display_name !== me.display_name) {
        console.log(`  Your jockey is now named ${poll.display_name} — a first link renames it to`);
        console.log('  the first name on the Google account. `token-derby init` renames it again');
        console.log('  if you would rather it said something else.');
      }
      await registerThisMachine(poll.display_name);
      return 0;
    }
    if (Date.now() >= deadline) {
      console.error('Timed out waiting for the Google link to complete. Run `token-derby link` again.');
      return 1;
    }
    await sleepImpl(POLL_INTERVAL_MS);
  }
}
