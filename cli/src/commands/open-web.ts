import { spawn } from 'node:child_process';
import { createWebSession } from '../api/endpoints.js';
import { SITE_ORIGIN, MARKET_ORIGIN } from '../config.js';
import { ApiError } from '../api/client.js';

export type Deps = { spawnImpl?: typeof spawn };

/** An API override (e.g. http://localhost:3000/api) serves its own site. */
export function webOrigin(): string {
  const override = process.env.TOKEN_DERBY_API_BASE;
  return override ? override.replace(/\/api\/?$/, '') : SITE_ORIGIN;
}

/** Where Derbymarket lives; an API override serves it from its own site. */
export function marketOrigin(): string {
  const override = process.env.TOKEN_DERBY_API_BASE;
  return override ? override.replace(/\/api\/?$/, '') : MARKET_ORIGIN;
}

export function opener(): string | null {
  if (process.platform === 'darwin') return 'open';
  if (process.platform === 'win32') return 'start';
  if (process.platform === 'linux') return 'xdg-open';
  return null;
}

export async function openWeb(
  path: string,
  label: string,
  deps: Deps = {},
  origin: string = webOrigin(),
): Promise<number> {
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

  const url = `${origin}${path}#code=${code}`;
  console.log('');
  console.log(`  Opening the Token Derby ${label} in your browser...`);
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
