import { spawn } from 'node:child_process';
import { createWebSession } from '../api/endpoints.js';
import { apiBase } from '../config.js';
import { ApiError } from '../api/client.js';

type Deps = { spawnImpl?: typeof spawn };

function webOrigin(): string {
  return apiBase().replace(/\/api\/?$/, '');
}

function opener(): string | null {
  if (process.platform === 'darwin') return 'open';
  if (process.platform === 'win32') return 'start';
  if (process.platform === 'linux') return 'xdg-open';
  return null;
}

export async function webCommand(deps: Deps = {}): Promise<number> {
  const spawnImpl = deps.spawnImpl ?? spawn;
  let code: string;
  try {
    ({ code } = await createWebSession());
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }

  const url = `${webOrigin()}/org-manager#code=${code}`;
  console.log('');
  console.log('  Opening the Token Derby org manager in your browser...');
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
  return 0;
}
