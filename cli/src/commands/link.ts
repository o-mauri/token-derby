import { spawn } from 'node:child_process';
import { getJockey, createWebSession } from '../api/endpoints.js';
import { webOrigin, opener } from './web.js';
import { ApiError } from '../api/client.js';
import {
  loadIdentity as loadIdentityDefault,
  saveIdentity as saveIdentityDefault,
} from '../identity/identity.js';
import { CREDENTIAL_DEAD_MESSAGE } from '../ui/messages.js';

export type LinkDeps = {
  apiGetJockey?: typeof getJockey;
  apiCreateWebSession?: typeof createWebSession;
  loadIdentity?: typeof loadIdentityDefault;
  saveIdentity?: typeof saveIdentityDefault;
  spawnImpl?: typeof spawn;
  sleepImpl?: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// How often to re-check for an email while waiting.
const POLL_INTERVAL_MS = 2_000;
// The grant itself expires in 60s, but the Google consent screen after
// redemption takes as long as the human in front of it takes — bound the
// wait generously so an abandoned browser fails honestly instead of
// spinning forever.
const WAIT_TIMEOUT_MS = 5 * 60 * 1_000;

export async function linkCommand(deps: LinkDeps = {}): Promise<number> {
  const apiGetJockey = deps.apiGetJockey ?? getJockey;
  const apiCreateWebSession = deps.apiCreateWebSession ?? createWebSession;
  const loadIdentity = deps.loadIdentity ?? loadIdentityDefault;
  const saveIdentity = deps.saveIdentity ?? saveIdentityDefault;
  const spawnImpl = deps.spawnImpl ?? spawn;
  const sleepImpl = deps.sleepImpl ?? defaultSleep;

  // The server renames the jockey to the Google first name on a first link, so
  // identity.json goes stale unless it is rewritten from what the server
  // reports afterwards. Everything local reads its name from that file.
  const syncLocalName = async (serverName: string): Promise<void> => {
    const local = await loadIdentity();
    if (!local || local.display_name === serverName) return;
    await saveIdentity({ ...local, display_name: serverName });
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
      await syncLocalName(poll.display_name);
      return 0;
    }
    if (Date.now() >= deadline) {
      console.error('Timed out waiting for the Google link to complete. Run `token-derby link` again.');
      return 1;
    }
    await sleepImpl(POLL_INTERVAL_MS);
  }
}
