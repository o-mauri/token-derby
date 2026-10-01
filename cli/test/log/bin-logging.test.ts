import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// bin.ts calls process.exit() at the top level, so process.exit is stubbed
// before importing it — see test/bin.test.ts for the same pattern.
describe('bin.ts lifecycle logging', () => {
  let origArgv: string[];
  let tmp: string;

  beforeEach(async () => {
    origArgv = process.argv;
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-binlog-'));
    process.env.TOKEN_DERBY_HOME = tmp;
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never));
  });

  afterEach(async () => {
    process.argv = origArgv;
    delete process.env.TOKEN_DERBY_HOME;
    await fs.rm(tmp, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function settle(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }

  function readLog(): string {
    const file = path.join(tmp, 'logs', 'token-derby.log');
    return fsSync.existsSync(file) ? fsSync.readFileSync(file, 'utf8') : '';
  }

  it('records the command it started and the code it exited with', async () => {
    vi.doMock('../../src/identity/identity.js', () => ({
      loadIdentity: vi.fn().mockResolvedValue({ user_id: 'u-1', display_name: 'T', secret_token: 's' }),
    }));
    const whoamiCommand = vi.fn().mockResolvedValue(0);
    vi.doMock('../../src/commands/whoami.js', () => ({ whoamiCommand }));

    process.argv = ['node', 'bin.js', 'whoami'];
    await import('../../src/bin.js');
    await settle();

    const text = readLog();
    expect(text).toContain('cmd.start');
    expect(text).toContain('"cmd":"whoami"');
    expect(text).toContain('cmd.exit');
    expect(text).toContain('"code":0');
  });

  it('records a crash with its stack when a command throws', async () => {
    vi.doMock('../../src/identity/identity.js', () => ({
      loadIdentity: vi.fn().mockResolvedValue({ user_id: 'u-1', display_name: 'T', secret_token: 's' }),
    }));
    vi.doMock('../../src/commands/whoami.js', () => ({
      whoamiCommand: vi.fn().mockRejectedValue(new Error('kaboom')),
    }));

    process.argv = ['node', 'bin.js', 'whoami'];
    await import('../../src/bin.js');
    await settle();

    const text = readLog();
    expect(text).toContain('ERROR cmd.crash');
    expect(text).toContain('kaboom');
  });

  it('does not write a join code or token from argv into the log', async () => {
    vi.doMock('../../src/identity/identity.js', () => ({
      loadIdentity: vi.fn().mockResolvedValue({ user_id: 'u-1', display_name: 'T', secret_token: 's' }),
    }));
    vi.doMock('../../src/commands/claim.js', () => ({ claimCommand: vi.fn().mockResolvedValue(0) }));

    process.argv = ['node', 'bin.js', 'claim', 'CLAIM_TOKEN_ABC'];
    await import('../../src/bin.js');
    await settle();

    expect(readLog()).not.toContain('CLAIM_TOKEN_ABC');
  });
});

describe('bin.ts logs command registration', () => {
  let origArgv: string[];

  beforeEach(() => {
    origArgv = process.argv;
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never));
  });

  afterEach(() => {
    process.argv = origArgv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('reaches `logs` with no identity on disk, instead of the identity gate', async () => {
    vi.doMock('../../src/identity/identity.js', () => ({
      loadIdentity: vi.fn().mockResolvedValue(null),
    }));
    const logsCommand = vi.fn().mockResolvedValue(0);
    vi.doMock('../../src/commands/logs.js', () => ({ logsCommand }));

    process.argv = ['node', 'bin.js', 'logs', '--tail', '10'];
    await import('../../src/bin.js');
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(logsCommand).toHaveBeenCalledWith(['--tail', '10']);
  });
});

describe('bin.ts crash handler installation', () => {
  let origArgv: string[];

  beforeEach(() => {
    origArgv = process.argv;
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never));
  });

  afterEach(() => {
    process.argv = origArgv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('installs the crash handlers once, however many times the module loads', async () => {
    process.argv = ['node', 'bin.js', '--version'];

    await import('../../src/bin.js');
    const afterFirst = process.listenerCount('uncaughtException');
    vi.resetModules();
    await import('../../src/bin.js');
    const afterSecond = process.listenerCount('uncaughtException');

    expect(afterSecond).toBe(afterFirst);
  });
});
