import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawn } from 'node:child_process';
import { gteSemver } from '@token-derby/shared';
import { CLI_VERSION } from '../version.js';

const REGISTRY_URL = 'https://registry.npmjs.org/@mauricode/token-derby/latest';
const UPGRADE_CMD = 'npm install -g @mauricode/token-derby@latest';
const FETCH_TIMEOUT_MS = 5_000;

type Deps = {
  fetchImpl?: typeof fetch;
  spawnImpl?: typeof spawn;
  promptYesNo?: (question: string) => Promise<boolean>;
};

export async function updateCommand(deps: Deps = {}): Promise<number> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const spawnImpl = deps.spawnImpl ?? spawn;
  const promptYesNo = deps.promptYesNo ?? defaultPromptYesNo;

  let latest: string;
  try {
    latest = await fetchLatestVersion(fetchImpl);
  } catch (e: any) {
    console.error(`Could not reach the npm registry${e?.message ? ` (${e.message})` : ''}.`);
    console.error(`To upgrade manually:  ${UPGRADE_CMD}`);
    return 1;
  }

  if (gteSemver(CLI_VERSION, latest)) {
    console.log(`You're on the latest version (${CLI_VERSION}).`);
    return 0;
  }

  console.log(`Current: ${CLI_VERSION}   Latest: ${latest}`);
  const yes = await promptYesNo('Run upgrade now? [y/N]: ');
  if (!yes) {
    console.log(`To upgrade manually:  ${UPGRADE_CMD}`);
    return 0;
  }

  return runNpmUpgrade(spawnImpl);
}

async function fetchLatestVersion(fetchImpl: typeof fetch): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(REGISTRY_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as { version?: unknown };
    if (typeof body.version !== 'string' || !/^\d+\.\d+\.\d+/.test(body.version)) {
      throw new Error('unexpected registry response');
    }
    return body.version;
  } finally {
    clearTimeout(t);
  }
}

async function defaultPromptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

function runNpmUpgrade(spawnImpl: typeof spawn): Promise<number> {
  return new Promise(resolve => {
    const child = spawnImpl('npm', ['install', '-g', '@mauricode/token-derby@latest'], {
      stdio: 'inherit',
    });
    child.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') {
        console.error('Could not find `npm` on PATH.');
        console.error(`To upgrade manually:  ${UPGRADE_CMD}`);
      } else {
        console.error(`npm failed to start: ${e.message}`);
      }
      resolve(1);
    });
    child.on('exit', code => resolve(code ?? 1));
  });
}
