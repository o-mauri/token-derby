import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawn } from 'node:child_process';
import { gteSemver } from '@token-derby/shared';
import { CLI_VERSION } from '../version.js';
import { logInfo, logError } from '../log/logger.js';

const REGISTRY_URL = 'https://registry.npmjs.org/@mauricode/token-derby/latest';
const UPGRADE_CMD = 'npm install -g @mauricode/token-derby@latest';
const FETCH_TIMEOUT_MS = 5_000;
const STDERR_TAIL_BYTES = 2_000;

// What Node and npm report when a machine's TLS-intercepting proxy re-signs
// traffic with a CA that Node does not trust. Neither tool reads the system
// trust store by default, so this is the usual failure behind a managed laptop.
const CERT_FAILURE = /UNABLE_TO_GET_ISSUER_CERT_LOCALLY|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|CERT_UNTRUSTED|unable to get local issuer certificate|self[- ]signed certificate/i;

const CERT_HINT = [
  'This looks like a TLS certificate problem, which is usual behind a company',
  'security proxy that re-signs HTTPS traffic. Point Node and npm at the proxy\'s',
  'CA certificate (ask your admin for the .pem), then run this again:',
  '  export NODE_EXTRA_CA_CERTS=/path/to/ca.pem',
  '  npm config set cafile /path/to/ca.pem',
];

const printCertHint = (): void => {
  for (const line of CERT_HINT) console.error(line);
};

type FetchFailure = { message: string; code?: string; cert: boolean };

// Node's fetch reports every network failure as "fetch failed" and keeps the real
// reason on `cause`, so the message alone says nothing about why.
const describeFetchFailure = (error: unknown): FetchFailure => {
  const failure = error as { message?: string; code?: string; cause?: { code?: string; message?: string } };
  const code = failure?.cause?.code ?? failure?.code;
  const reason = failure?.cause?.message ?? failure?.message ?? '';
  const message = [failure?.message, code].filter(Boolean).join(': ');
  return { message, code, cert: CERT_FAILURE.test(`${code ?? ''} ${reason}`) };
};

type NpmResult = { code: number; signal: NodeJS.Signals | null; stderrTail: string };

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
    const failure = describeFetchFailure(e);
    logError('update.registry_failed', { message: failure.message, code: failure.code, cert: failure.cert });
    console.error(`Could not reach the npm registry${failure.message ? ` (${failure.message})` : ''}.`);
    if (failure.cert) printCertHint();
    console.error(`To upgrade manually:  ${UPGRADE_CMD}`);
    return 1;
  }

  if (gteSemver(CLI_VERSION, latest)) {
    logInfo('update.up_to_date', { current: CLI_VERSION, latest });
    console.log(`You're on the latest version (${CLI_VERSION}).`);
    return 0;
  }

  logInfo('update.available', { current: CLI_VERSION, latest });
  console.log(`Current: ${CLI_VERSION}   Latest: ${latest}`);
  const yes = await promptYesNo('Run upgrade now? [y/N]: ');
  if (!yes) {
    logInfo('update.declined', { current: CLI_VERSION, latest });
    console.log(`To upgrade manually:  ${UPGRADE_CMD}`);
    return 0;
  }

  const { code, signal, stderrTail } = await runNpmUpgrade(spawnImpl);
  if (code !== 0) {
    logError('update.npm_failed', { code, signal, current: CLI_VERSION, latest, stderr_tail: stderrTail });
    console.error(`\nUpgrade failed: npm exited with ${signal ? `signal ${signal}` : `code ${code}`}. You are still on ${CLI_VERSION}.`);
    if (CERT_FAILURE.test(stderrTail)) printCertHint();
    console.error(`To upgrade manually:  ${UPGRADE_CMD}`);
    return code;
  }
  logInfo('update.npm_ok', { current: CLI_VERSION, latest });
  console.log(`\nUpgraded to ${latest}.`);
  console.log(`If \`token-derby --version\` still shows ${CLI_VERSION}, your shell has`);
  console.log(`the old path cached. Drop the cache by running ONE of:`);
  console.log(`  exec $SHELL     (any shell — replaces this shell with a fresh one)`);
  console.log(`  rehash          (zsh)`);
  console.log(`  hash -r         (bash)`);
  console.log(`Or just open a new terminal tab.`);
  console.log(`If --version still doesn't match after that, you may have multiple`);
  console.log(`installs — run \`which -a token-derby\` to compare against \`npm bin -g\`.`);
  return 0;
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

function runNpmUpgrade(spawnImpl: typeof spawn): Promise<NpmResult> {
  return new Promise(resolve => {
    const startedAt = Date.now();
    let stderrTail = '';
    const child = spawnImpl('npm', ['install', '-g', '@mauricode/token-derby@latest'], {
      stdio: ['inherit', 'inherit', 'pipe'],
    });
    // npm's own error is the useful part, so it still reaches the terminal; the
    // tail is kept so the log can say why, not just that it failed.
    child.stderr?.on('data', (chunk: Buffer | string) => {
      process.stderr.write(chunk);
      stderrTail = `${stderrTail}${chunk}`.slice(-STDERR_TAIL_BYTES);
    });
    child.on('error', (e: NodeJS.ErrnoException) => {
      logError('update.npm_spawn_failed', { code: e.code, message: e.message, ms: Date.now() - startedAt });
      if (e.code === 'ENOENT') {
        console.error('Could not find `npm` on PATH.');
        console.error(`To upgrade manually:  ${UPGRADE_CMD}`);
      } else {
        console.error(`npm failed to start: ${e.message}`);
      }
      resolve({ code: 1, signal: null, stderrTail });
    });
    child.on('exit', (code, signal) => resolve({ code: code ?? 1, signal: signal ?? null, stderrTail }));
  });
}
