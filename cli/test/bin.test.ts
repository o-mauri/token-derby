import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// bin.ts calls process.exit() at the top level (main().then(code => process.exit(code))),
// so importing it for real must stub process.exit before the import — otherwise it
// would kill this test worker outright.
describe('bin.ts command registration order', () => {
  let origArgv: string[];
  let exitSpy: any;
  let errorSpy: any;
  let logSpy: any;

  beforeEach(() => {
    origArgv = process.argv;
    vi.resetModules();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never));
  });

  afterEach(() => {
    process.argv = origArgv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function settle(): Promise<void> {
    // Lets the async main()/.then() chain (which runs as a side effect of
    // importing bin.ts) actually finish before we assert on it.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }

  it('reaches `login` even with no identity on disk, instead of the identity gate', async () => {
    vi.doMock('../src/identity/identity.js', () => ({
      loadIdentity: vi.fn().mockResolvedValue(null),
    }));
    const loginCommand = vi.fn().mockResolvedValue(0);
    vi.doMock('../src/commands/login.js', () => ({ loginCommand }));

    process.argv = ['node', 'bin.js', 'login', '--device-name', 'x'];

    await import('../src/bin.js');
    await settle();

    expect(loginCommand).toHaveBeenCalledWith(['--device-name', 'x']);
    const errorText = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(errorText).not.toContain('token-derby init');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('does not reach `logout` when there is no identity — the gate bites like any other non-escape-hatch command', async () => {
    vi.doMock('../src/identity/identity.js', () => ({
      loadIdentity: vi.fn().mockResolvedValue(null),
    }));
    const logoutCommand = vi.fn().mockResolvedValue(0);
    vi.doMock('../src/commands/logout.js', () => ({ logoutCommand }));

    process.argv = ['node', 'bin.js', 'logout'];

    await import('../src/bin.js');
    await settle();

    expect(logoutCommand).not.toHaveBeenCalled();
    const errorText = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(errorText).toContain('token-derby init');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('reaches `logout` once an identity is on disk', async () => {
    vi.doMock('../src/identity/identity.js', () => ({
      loadIdentity: vi.fn().mockResolvedValue({
        user_id: 'u', display_name: 'D', secret_token: 't', created_at: '2026-01-01T00:00:00Z',
      }),
    }));
    const logoutCommand = vi.fn().mockResolvedValue(0);
    vi.doMock('../src/commands/logout.js', () => ({ logoutCommand }));

    process.argv = ['node', 'bin.js', 'logout'];

    await import('../src/bin.js');
    await settle();

    expect(logoutCommand).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('control: a command that is NOT one of the escape hatches still hits the identity gate with no identity', async () => {
    vi.doMock('../src/identity/identity.js', () => ({
      loadIdentity: vi.fn().mockResolvedValue(null),
    }));
    const joinCommand = vi.fn().mockResolvedValue(0);
    vi.doMock('../src/commands/join.js', () => ({ joinCommand }));

    process.argv = ['node', 'bin.js', 'join', 'ABCD1234'];

    await import('../src/bin.js');
    await settle();

    expect(joinCommand).not.toHaveBeenCalled();
    const errorText = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(errorText).toContain('token-derby init');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
