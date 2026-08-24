import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  loadIdentity as loadIdentityDefault,
  saveIdentity as saveIdentityDefault,
  deleteIdentity as deleteIdentityDefault,
  readIdentityFile as readIdentityFileDefault,
  validateDisplayName,
  type Identity,
} from '../identity/identity.js';
import {
  initJockey as initJockeyDefault,
  updateJockey as updateJockeyDefault,
  getJockey as getJockeyDefault,
} from '../api/endpoints.js';
import { ApiError, _resetIdentityCacheForTests } from '../api/client.js';

export type InitDeps = {
  loadIdentity?: typeof loadIdentityDefault;
  saveIdentity?: typeof saveIdentityDefault;
  deleteIdentity?: typeof deleteIdentityDefault;
  readIdentityFile?: typeof readIdentityFileDefault;
  initJockey?: typeof initJockeyDefault;
  updateJockey?: typeof updateJockeyDefault;
  apiGetJockey?: typeof getJockeyDefault;
  promptText?: (question: string) => Promise<string>;
  isTTY?: boolean;
};

async function defaultPromptText(question: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

export async function initCommand(reset = false, deps: InitDeps = {}): Promise<number> {
  const loadIdentity = deps.loadIdentity ?? loadIdentityDefault;
  const saveIdentity = deps.saveIdentity ?? saveIdentityDefault;
  const deleteIdentity = deps.deleteIdentity ?? deleteIdentityDefault;
  const readIdentityFile = deps.readIdentityFile ?? readIdentityFileDefault;
  const initJockey = deps.initJockey ?? initJockeyDefault;
  const updateJockey = deps.updateJockey ?? updateJockeyDefault;
  const apiGetJockey = deps.apiGetJockey ?? getJockeyDefault;
  const promptText = deps.promptText ?? defaultPromptText;
  const isTTY = deps.isTTY ?? Boolean(process.stdin.isTTY);

  console.log('');
  console.log(
    'Heads up: `token-derby login` is becoming the only way to manage accounts on this ' +
    'machine. `init` still works today, but plan to move over.',
  );
  console.log('');

  if (reset) {
    // Keyed on the file existing, not on it parsing: a hand-edited or
    // unreadable identity.json still holds the only copy of a secret_token, and
    // not being able to read it is itself a reason to stop rather than delete.
    const current = await readIdentityFile();
    if (current.kind !== 'missing') {
      if (current.kind === 'ok') {
        console.log(`About to abandon jockey: ${current.identity.display_name}`);
      } else if (current.kind === 'unreadable') {
        console.log(`About to delete identity.json, which ${current.reason}.`);
        console.log('The credential inside cannot be read, so there is no way to tell which jockey');
        console.log('this is, or whether anything else can still recover it.');
      } else {
        console.log(`About to delete identity.json, which ${current.reason}.`);
      }
      console.log('This deletes the local identity only — the account itself stays on the server.');

      if (current.kind === 'ok') {
        try {
          const me = await apiGetJockey();
          if (me.device_label) {
            console.log(`  This machine's credential, "${me.device_label}", will stay live on the`);
            console.log('  abandoned account and can only be revoked from the Account view in the org manager.');
          }
          if (me.email) {
            console.log('  This account has a Google account linked — `token-derby login` would recover');
            console.log('  this same jockey instead of abandoning it.');
          }
        } catch {
          // Best-effort only — a warning must not depend on the network being reachable.
        }
      }

      if (!isTTY) {
        console.error('');
        console.error('Refusing to reset without a terminal to confirm — this is irreversible.');
        console.error(
          'Run `token-derby init --reset` interactively, or use `token-derby login` to recover ' +
          'this jockey instead.',
        );
        return 1;
      }

      const answer = (await promptText('Type "yes" to abandon this jockey [no]: ')).trim().toLowerCase();
      if (answer !== 'yes') {
        console.log('Reset cancelled. Nothing was deleted.');
        return 0;
      }
    }

    await deleteIdentity();
    _resetIdentityCacheForTests();
    console.log('Removed local identity. Creating a new one…');
  }

  // A file that exists but cannot be parsed reads as `null` from loadIdentity,
  // so without this check plain `init` would create a new account and overwrite
  // it — destroying a legacy secret_token that cannot be recovered. --reset is
  // the path for discarding it deliberately, and it asks first.
  //
  // Only when it MIGHT hold a credential, though: a file with no secret_token in
  // it has nothing to destroy, and refusing there would strand an old shape on a
  // command that used to handle it.
  if (!reset) {
    const state = await readIdentityFile();
    if (state.kind === 'unreadable') {
      console.error(`Your local identity file ${state.reason}.`);
      console.error('It may hold a credential that cannot be recovered, so this will not overwrite it.');
      console.error('Run `token-derby login` to sign in fresh, or `token-derby init --reset` to discard it.');
      return 1;
    }
    if (state.kind === 'no-credential') {
      console.log(`Your local identity file ${state.reason}, so this will replace it.`);
    }
  }

  const existing = await loadIdentity();
  if (existing) {
    console.log(`Current jockey name: ${existing.display_name}`);
    const raw = (await promptText('New jockey name (use your real name please) [keep]: ')).trim();
    if (!raw) {
      console.log('Kept existing name.');
      return 0;
    }
    const v = validateDisplayName(raw);
    if (!v.ok) { console.error(v.error); return 1; }
    try {
      const resp = await updateJockey({ display_name: v.name });
      const updated: Identity = { ...existing, display_name: resp.display_name };
      await saveIdentity(updated);
      console.log(`Updated jockey name to: ${updated.display_name}`);
      return 0;
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'UNAUTHENTICATED') {
          console.error(
            'Server does not recognise this identity. Your account may have been wiped. ' +
            'Run `token-derby init --reset` to start fresh.',
          );
        } else {
          console.error(`Error: ${e.code} ${e.message}`);
        }
        return 1;
      }
      throw e;
    }
  }

  const raw = (await promptText('Jockey Name (use your real name please): ')).trim();
  const v = validateDisplayName(raw);
  if (!v.ok) { console.error(v.error); return 1; }

  try {
    const resp = await initJockey({ display_name: v.name });
    const identity: Identity = {
      user_id: resp.user_id,
      display_name: resp.display_name,
      secret_token: resp.secret_token,
      created_at: new Date().toISOString(),
    };
    await saveIdentity(identity);
    _resetIdentityCacheForTests();
    console.log('');
    console.log(`Welcome, ${identity.display_name}!`);
    console.log('Your identity has been created on the server.');
    console.log('You can now create a stable and join races.');
    console.log('');
    console.log('  ⚠  Your secret token is stored locally in identity.json.');
    console.log('     If you lose it, you cannot recover this account — you would');
    console.log('     need to run `token-derby init --reset` and rebuild your stable.');
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
}
