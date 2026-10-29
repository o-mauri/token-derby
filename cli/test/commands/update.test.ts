import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { updateCommand } from '../../src/commands/update.js';
import { CLI_VERSION } from '../../src/version.js';
import { logFile } from '../../src/paths.js';
import { _resetLoggerForTests } from '../../src/log/logger.js';

let logs: string[] = [];
let errs: string[] = [];
let origLog: typeof console.log;
let origErr: typeof console.error;
let home: string;

// The updater logs every outcome, so each test gets its own log rather than
// writing into the developer's real ~/.token-derby.
beforeEach(() => {
  logs = []; errs = [];
  origLog = console.log;
  origErr = console.error;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
  console.error = (...a: unknown[]) => { errs.push(a.map(String).join(' ')); };
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'td-update-'));
  process.env.TOKEN_DERBY_HOME = home;
  _resetLoggerForTests();
});

afterEach(() => {
  console.log = origLog;
  console.error = origErr;
  fs.rmSync(home, { recursive: true, force: true });
  delete process.env.TOKEN_DERBY_HOME;
  _resetLoggerForTests();
});

const readLog = (): string => (fs.existsSync(logFile()) ? fs.readFileSync(logFile(), 'utf8') : '');

function fakeFetch(version: string | null, opts: { status?: number; throws?: Error } = {}) {
  return vi.fn(async () => {
    if (opts.throws) throw opts.throws;
    return {
      ok: opts.status === undefined || (opts.status >= 200 && opts.status < 300),
      status: opts.status ?? 200,
      json: async () => (version === null ? {} : { version }),
    } as unknown as Response;
  });
}

function fakeSpawn(exitCode = 0, errorOnSpawn?: NodeJS.ErrnoException, stderrText?: string) {
  const spy = vi.fn(() => {
    const ee = new EventEmitter() as any;
    ee.stderr = new EventEmitter();
    if (errorOnSpawn) {
      setImmediate(() => ee.emit('error', errorOnSpawn));
    } else {
      setImmediate(() => {
        if (stderrText) ee.stderr.emit('data', Buffer.from(stderrText));
        ee.emit('exit', exitCode, null);
      });
    }
    return ee;
  });
  return spy;
}

// What Node's fetch throws: a generic message, with the reason on `cause`.
const fetchFailedWith = (code: string, message: string) =>
  Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(message), { code }) });

const quietStderr = () => vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

describe('updateCommand', () => {
  it('reports already-on-latest and skips the prompt', async () => {
    const fetchImpl = fakeFetch(CLI_VERSION);
    const spawnImpl = fakeSpawn();
    const promptYesNo = vi.fn();
    const rc = await updateCommand({ fetchImpl: fetchImpl as any, spawnImpl: spawnImpl as any, promptYesNo });
    expect(rc).toBe(0);
    expect(promptYesNo).not.toHaveBeenCalled();
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(logs.join('\n')).toMatch(/latest version/);
  });

  it('prints the manual command when the user declines the upgrade', async () => {
    const fetchImpl = fakeFetch('99.99.99');
    const spawnImpl = fakeSpawn();
    const promptYesNo = vi.fn().mockResolvedValue(false);
    const rc = await updateCommand({ fetchImpl: fetchImpl as any, spawnImpl: spawnImpl as any, promptYesNo });
    expect(rc).toBe(0);
    expect(promptYesNo).toHaveBeenCalledOnce();
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(logs.join('\n')).toMatch(/npm install -g @mauricode\/token-derby@latest/);
  });

  it('spawns npm install when the user accepts', async () => {
    const fetchImpl = fakeFetch('99.99.99');
    const spawnImpl = fakeSpawn(0);
    const promptYesNo = vi.fn().mockResolvedValue(true);
    const rc = await updateCommand({ fetchImpl: fetchImpl as any, spawnImpl: spawnImpl as any, promptYesNo });
    expect(rc).toBe(0);
    expect(spawnImpl).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', '@mauricode/token-derby@latest'],
      { stdio: ['inherit', 'inherit', 'pipe'] },
    );
  });

  it('returns npm exit code when the install fails', async () => {
    const fetchImpl = fakeFetch('99.99.99');
    const spawnImpl = fakeSpawn(7);
    const promptYesNo = vi.fn().mockResolvedValue(true);
    const rc = await updateCommand({ fetchImpl: fetchImpl as any, spawnImpl: spawnImpl as any, promptYesNo });
    expect(rc).toBe(7);
  });

  it('handles missing npm with a clear message', async () => {
    const fetchImpl = fakeFetch('99.99.99');
    const enoent = Object.assign(new Error('spawn npm ENOENT'), { code: 'ENOENT' }) as NodeJS.ErrnoException;
    const spawnImpl = fakeSpawn(0, enoent);
    const promptYesNo = vi.fn().mockResolvedValue(true);
    const rc = await updateCommand({ fetchImpl: fetchImpl as any, spawnImpl: spawnImpl as any, promptYesNo });
    expect(rc).toBe(1);
    expect(errs.join('\n')).toMatch(/Could not find `npm`/);
    expect(errs.join('\n')).toMatch(/npm install -g/);
  });

  it('exits 1 with a fallback message when the registry is unreachable', async () => {
    const fetchImpl = fakeFetch(null, { throws: new Error('ECONNREFUSED') });
    const spawnImpl = fakeSpawn();
    const promptYesNo = vi.fn();
    const rc = await updateCommand({ fetchImpl: fetchImpl as any, spawnImpl: spawnImpl as any, promptYesNo });
    expect(rc).toBe(1);
    expect(promptYesNo).not.toHaveBeenCalled();
    expect(errs.join('\n')).toMatch(/npm registry/);
    expect(errs.join('\n')).toMatch(/npm install -g/);
  });

  it('exits 1 when the registry returns an unparseable version', async () => {
    const fetchImpl = fakeFetch(null);  // body is {} → no version field
    const spawnImpl = fakeSpawn();
    const rc = await updateCommand({ fetchImpl: fetchImpl as any, spawnImpl: spawnImpl as any });
    expect(rc).toBe(1);
  });

  describe('when npm fails', () => {
    it('says the upgrade failed and that the version is unchanged', async () => {
      const spoken = quietStderr();
      const rc = await updateCommand({ fetchImpl: fakeFetch('99.99.99') as any, spawnImpl: fakeSpawn(1, undefined, 'npm error code E404') as any, promptYesNo: vi.fn().mockResolvedValue(true) });
      expect(rc).toBe(1);
      expect(errs.join('\n')).toMatch(new RegExp(`Upgrade failed: npm exited with code 1. You are still on ${CLI_VERSION.replace(/\./g, '\\.')}`));
      expect(errs.join('\n')).toMatch(/npm install -g/);
      expect(errs.join('\n')).not.toMatch(/NODE_EXTRA_CA_CERTS/);
      expect(logs.join('\n')).not.toMatch(/Upgraded to/);
      spoken.mockRestore();
    });

    it('logs the exit code and the end of what npm said', async () => {
      const spoken = quietStderr();
      await updateCommand({ fetchImpl: fakeFetch('99.99.99') as any, spawnImpl: fakeSpawn(1, undefined, 'npm error code E404\nnpm error 404 Not Found') as any, promptYesNo: vi.fn().mockResolvedValue(true) });
      const line = readLog().split('\n').find(entry => entry.includes('update.npm_failed')) ?? '';
      expect(line).toContain('ERROR');
      expect(line).toContain('"code":1');
      expect(line).toContain('npm error 404 Not Found');
      spoken.mockRestore();
    });

    it('still shows npm\'s own output on the terminal', async () => {
      const spoken = quietStderr();
      await updateCommand({ fetchImpl: fakeFetch('99.99.99') as any, spawnImpl: fakeSpawn(1, undefined, 'npm error code E404') as any, promptYesNo: vi.fn().mockResolvedValue(true) });
      expect(String(spoken.mock.calls[0]![0])).toContain('npm error code E404');
      spoken.mockRestore();
    });

    it('points at the proxy CA when npm hit a certificate error', async () => {
      const spoken = quietStderr();
      await updateCommand({ fetchImpl: fakeFetch('99.99.99') as any, spawnImpl: fakeSpawn(1, undefined, 'npm error code UNABLE_TO_GET_ISSUER_CERT_LOCALLY') as any, promptYesNo: vi.fn().mockResolvedValue(true) });
      expect(errs.join('\n')).toMatch(/NODE_EXTRA_CA_CERTS/);
      expect(errs.join('\n')).toMatch(/cafile/);
      spoken.mockRestore();
    });

    it('reports a kill by signal rather than an exit code', async () => {
      const spoken = quietStderr();
      const killed = vi.fn(() => {
        const child = new EventEmitter() as any;
        child.stderr = new EventEmitter();
        setImmediate(() => child.emit('exit', null, 'SIGTERM'));
        return child;
      });
      const rc = await updateCommand({ fetchImpl: fakeFetch('99.99.99') as any, spawnImpl: killed as any, promptYesNo: vi.fn().mockResolvedValue(true) });
      expect(rc).toBe(1);
      expect(errs.join('\n')).toMatch(/signal SIGTERM/);
      spoken.mockRestore();
    });

    it('logs a missing npm', async () => {
      const enoent = Object.assign(new Error('spawn npm ENOENT'), { code: 'ENOENT' }) as NodeJS.ErrnoException;
      await updateCommand({ fetchImpl: fakeFetch('99.99.99') as any, spawnImpl: fakeSpawn(0, enoent) as any, promptYesNo: vi.fn().mockResolvedValue(true) });
      expect(readLog()).toContain('update.npm_spawn_failed');
      expect(readLog()).toContain('ENOENT');
    });
  });

  describe('when the registry cannot be reached', () => {
    it('names the underlying reason, not just "fetch failed"', async () => {
      const failure = fetchFailedWith('ECONNREFUSED', 'connect ECONNREFUSED 104.16.0.1:443');
      const rc = await updateCommand({ fetchImpl: fakeFetch(null, { throws: failure }) as any, spawnImpl: fakeSpawn() as any, promptYesNo: vi.fn() });
      expect(rc).toBe(1);
      expect(errs.join('\n')).toMatch(/fetch failed: ECONNREFUSED/);
      expect(errs.join('\n')).not.toMatch(/NODE_EXTRA_CA_CERTS/);
    });

    it('points at the proxy CA on a certificate error', async () => {
      const failure = fetchFailedWith('UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'unable to get local issuer certificate');
      await updateCommand({ fetchImpl: fakeFetch(null, { throws: failure }) as any, spawnImpl: fakeSpawn() as any, promptYesNo: vi.fn() });
      expect(errs.join('\n')).toMatch(/UNABLE_TO_GET_ISSUER_CERT_LOCALLY/);
      expect(errs.join('\n')).toMatch(/NODE_EXTRA_CA_CERTS/);
    });

    it('logs the failure with its cause code', async () => {
      const failure = fetchFailedWith('SELF_SIGNED_CERT_IN_CHAIN', 'self-signed certificate in certificate chain');
      await updateCommand({ fetchImpl: fakeFetch(null, { throws: failure }) as any, spawnImpl: fakeSpawn() as any, promptYesNo: vi.fn() });
      const line = readLog().split('\n').find(entry => entry.includes('update.registry_failed')) ?? '';
      expect(line).toContain('ERROR');
      expect(line).toContain('SELF_SIGNED_CERT_IN_CHAIN');
      expect(line).toContain('"cert":true');
    });
  });

  describe('what the log records', () => {
    it('says it was already up to date', async () => {
      await updateCommand({ fetchImpl: fakeFetch(CLI_VERSION) as any, spawnImpl: fakeSpawn() as any, promptYesNo: vi.fn() });
      expect(readLog()).toContain('update.up_to_date');
    });

    it('says the user declined', async () => {
      await updateCommand({ fetchImpl: fakeFetch('99.99.99') as any, spawnImpl: fakeSpawn() as any, promptYesNo: vi.fn().mockResolvedValue(false) });
      expect(readLog()).toContain('update.available');
      expect(readLog()).toContain('update.declined');
    });

    it('says npm succeeded', async () => {
      await updateCommand({ fetchImpl: fakeFetch('99.99.99') as any, spawnImpl: fakeSpawn(0) as any, promptYesNo: vi.fn().mockResolvedValue(true) });
      expect(readLog()).toContain('update.npm_ok');
    });
  });
});
