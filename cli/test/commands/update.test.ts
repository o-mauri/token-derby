import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { updateCommand } from '../../src/commands/update.js';
import { CLI_VERSION } from '../../src/version.js';

let logs: string[] = [];
let errs: string[] = [];
let origLog: typeof console.log;
let origErr: typeof console.error;

beforeEach(() => {
  logs = []; errs = [];
  origLog = console.log;
  origErr = console.error;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
  console.error = (...a: unknown[]) => { errs.push(a.map(String).join(' ')); };
});

afterEach(() => {
  console.log = origLog;
  console.error = origErr;
});

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

function fakeSpawn(exitCode = 0, errorOnSpawn?: NodeJS.ErrnoException) {
  const spy = vi.fn(() => {
    const ee = new EventEmitter() as any;
    if (errorOnSpawn) {
      setImmediate(() => ee.emit('error', errorOnSpawn));
    } else {
      setImmediate(() => ee.emit('exit', exitCode));
    }
    return ee;
  });
  return spy;
}

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
      { stdio: 'inherit' },
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
});
