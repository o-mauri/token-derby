import { describe, it, expect, vi, afterEach } from 'vitest';
import { linkCommand } from '../../src/commands/link.js';
import { ApiError } from '../../src/api/client.js';
import type { Identity } from '../../src/identity/identity.js';
import type { GetJockeyResponse, WebSessionCreateResponse, RegisterDeviceResponse } from '@token-derby/shared';

function identity(overrides: Partial<Identity> = {}): Identity {
  return {
    user_id: 'user-1',
    display_name: 'Omar',
    secret_token: 'legacy-account-token',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function jockey(overrides: Partial<GetJockeyResponse> = {}): GetJockeyResponse {
  return {
    user_id: 'user-1',
    display_name: 'Omar',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function session(overrides: Partial<WebSessionCreateResponse> = {}): WebSessionCreateResponse {
  return { code: 'GRANT123', ...overrides };
}

function registration(overrides: Partial<RegisterDeviceResponse> = {}): RegisterDeviceResponse {
  return { device_id: 'device-1', secret_token: 'fresh-device-token', ...overrides };
}

/** A registration stub that succeeds and remembers the label it was given. */
function okRegister(overrides: Partial<RegisterDeviceResponse> = {}) {
  return vi.fn().mockResolvedValue(registration(overrides));
}

function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  return {
    logs, errors,
    restore: () => { console.log = origLog; console.error = origError; },
  };
}

/** The deps every happy-path run needs: no browser, no real prompt, no clock. */
function baseDeps() {
  return {
    spawnImpl: vi.fn(() => ({ on: () => {}, unref: () => {} })) as any,
    sleepImpl: vi.fn(),
    isTTY: false,
    hostname: () => 'omars-macbook',
    promptText: vi.fn(),
  };
}

afterEach(() => {
  vi.useRealTimers();
  delete process.env.TOKEN_DERBY_API_BASE;
});

describe('linkCommand', () => {
  it('already linked: prints the email, exits 0, and never mints a grant or a device', async () => {
    const apiGetJockey = vi.fn().mockResolvedValue(jockey({ email: 'omar@stackone.com' }));
    const apiCreateWebSession = vi.fn();
    const apiRegisterDevice = okRegister();
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand([], {
        ...baseDeps(), apiGetJockey, apiCreateWebSession, apiRegisterDevice,
        loadIdentity: vi.fn().mockResolvedValue(null), saveIdentity: vi.fn(),
      });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    expect(con.logs.join('\n')).toContain('Already linked to omar@stackone.com.');
    expect(apiCreateWebSession).not.toHaveBeenCalled();
    // Re-running `link` is how somebody checks their state. It must not quietly
    // mint a credential every time — each one is a row to revoke by hand.
    expect(apiRegisterDevice).not.toHaveBeenCalled();
    expect(apiGetJockey).toHaveBeenCalledTimes(1);
  });

  it('prints a /link URL carrying the minted grant, and opens it', async () => {
    process.env.TOKEN_DERBY_API_BASE = 'https://example.test/api';
    const apiGetJockey = vi.fn()
      .mockResolvedValueOnce(jockey())
      .mockResolvedValueOnce(jockey({ email: 'omar@stackone.com' }));
    const apiCreateWebSession = vi.fn().mockResolvedValue(session({ code: 'GRANT123' }));
    const deps = baseDeps();
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand([], {
        ...deps, apiGetJockey, apiCreateWebSession, apiRegisterDevice: okRegister(),
        loadIdentity: vi.fn().mockResolvedValue(identity()), saveIdentity: vi.fn(),
      });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    const out = con.logs.join('\n');
    expect(out).toContain('https://example.test/link#code=GRANT123');
    expect(deps.spawnImpl).toHaveBeenCalled();
    expect(JSON.stringify(deps.spawnImpl.mock.calls[0])).toContain('https://example.test/link#code=GRANT123');
  });

  it('polls repeatedly while unlinked and stops as soon as the email appears', async () => {
    const apiGetJockey = vi.fn()
      .mockResolvedValueOnce(jockey())                                     // initial "already linked?" check
      .mockResolvedValueOnce(jockey())                                     // poll: still no email
      .mockResolvedValueOnce(jockey())                                     // poll: still no email
      .mockResolvedValueOnce(jockey({ email: 'omar@stackone.com' }));      // poll: linked
    const deps = baseDeps();
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand([], {
        ...deps, apiGetJockey,
        apiCreateWebSession: vi.fn().mockResolvedValue(session()),
        apiRegisterDevice: okRegister(),
        loadIdentity: vi.fn().mockResolvedValue(identity()), saveIdentity: vi.fn(),
      });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    expect(apiGetJockey).toHaveBeenCalledTimes(4);
    // One sleep between each unlinked poll, none after the linked one.
    expect(deps.sleepImpl).toHaveBeenCalledTimes(2);
    expect(con.logs.join('\n')).toContain('✓ Linked to omar@stackone.com.');
  });

  it('fails with an honest message and a non-zero exit once the bounded wait elapses', async () => {
    vi.useFakeTimers();
    const apiGetJockey = vi.fn().mockResolvedValue(jockey()); // never gains an email
    const apiRegisterDevice = okRegister();
    // Time only moves when the command sleeps, so the fake clock advances in
    // lockstep with the poll loop and nothing waits in real time.
    const sleepImpl = vi.fn(async (ms: number) => { vi.advanceTimersByTime(ms); });
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand([], {
        ...baseDeps(), apiGetJockey, apiRegisterDevice, sleepImpl,
        apiCreateWebSession: vi.fn().mockResolvedValue(session()),
        loadIdentity: vi.fn().mockResolvedValue(identity()), saveIdentity: vi.fn(),
      });
    } finally {
      con.restore();
      vi.useRealTimers();
    }

    expect(rc).toBe(1);
    expect(con.errors.join('\n')).toMatch(/timed out/i);
    // A link that never happened registers nothing.
    expect(apiRegisterDevice).not.toHaveBeenCalled();
  });

  describe('registering this machine as a device', () => {
    function linkRun(overrides: {
      linkedName?: string;
      local?: Identity | null;
      register?: ReturnType<typeof vi.fn>;
    } = {}) {
      const linkedName = overrides.linkedName ?? 'Omar';
      const apiGetJockey = vi.fn()
        .mockResolvedValueOnce(jockey({ display_name: 'Omar' }))
        .mockResolvedValueOnce(jockey({ display_name: linkedName, email: 'omar@stackone.com' }));
      const loadIdentity = vi.fn().mockResolvedValue(
        overrides.local === undefined ? identity({ display_name: 'Omar' }) : overrides.local,
      );
      const saveIdentity = vi.fn().mockResolvedValue(undefined);
      const apiRegisterDevice = overrides.register ?? okRegister();
      return { apiGetJockey, loadIdentity, saveIdentity, apiRegisterDevice };
    }

    async function run(deps: ReturnType<typeof linkRun>, argv: string[] = [], extra: Record<string, unknown> = {}) {
      const con = captureConsole();
      try {
        const rc = await linkCommand(argv, {
          ...baseDeps(), ...deps,
          apiCreateWebSession: vi.fn().mockResolvedValue(session()),
          ...extra,
        });
        return { rc, logs: con.logs.join('\n'), errors: con.errors.join('\n') };
      } finally {
        con.restore();
      }
    }

    it('overwrites identity.json with the freshly minted device credential', async () => {
      const deps = linkRun();
      const { rc } = await run(deps);

      expect(rc).toBe(0);
      expect(deps.apiRegisterDevice).toHaveBeenCalledTimes(1);
      expect(deps.saveIdentity).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'user-1',
        secret_token: 'fresh-device-token',
      }));
    });

    it('leaves the legacy token nowhere in the file it wrote, so nothing reads it again', async () => {
      const deps = linkRun();
      await run(deps);

      // The point of the whole exercise: after this command, the credential on
      // disk is the revocable per-machine one. Anything still loading the shared
      // account token from identity.json would keep the machine un-migrated.
      expect(deps.saveIdentity).toHaveBeenCalled();
      for (const [written] of deps.saveIdentity.mock.calls) {
        expect((written as Identity).secret_token).not.toBe('legacy-account-token');
      }
      const last = deps.saveIdentity.mock.calls.at(-1)![0] as Identity;
      expect(last.secret_token).toBe('fresh-device-token');
    });

    it('says the machine is registered, and under what name', async () => {
      const deps = linkRun();
      const { logs } = await run(deps, ['--device-name', 'work-laptop']);

      expect(logs).toMatch(/registered as "work-laptop"/);
    });

    it('folds the link rename and the new credential into one write', async () => {
      const deps = linkRun({ linkedName: 'Om' });
      const { rc, logs } = await run(deps);

      expect(rc).toBe(0);
      expect(logs).toContain('now named Om');
      // One write, carrying both changes: the server's new name and the new
      // credential. Two writes would leave a window with one but not the other.
      expect(deps.saveIdentity).toHaveBeenCalledTimes(1);
      expect(deps.saveIdentity).toHaveBeenCalledWith(expect.objectContaining({
        display_name: 'Om',
        secret_token: 'fresh-device-token',
        user_id: 'user-1',
      }));
    });

    it('keeps the local name when the link did not change it', async () => {
      const deps = linkRun({ linkedName: 'Omar' });
      const { logs } = await run(deps);

      expect(logs).not.toMatch(/now named/i);
      expect(deps.saveIdentity).toHaveBeenCalledWith(expect.objectContaining({
        display_name: 'Omar',
        secret_token: 'fresh-device-token',
      }));
    });

    it('registers nothing when there is no identity.json to hold the credential', async () => {
      const deps = linkRun({ linkedName: 'Om', local: null });
      const { rc, logs } = await run(deps);

      expect(rc).toBe(0);
      // A credential with nowhere to live is a device row the person can see and
      // no machine can use, so it is never minted.
      expect(deps.apiRegisterDevice).not.toHaveBeenCalled();
      expect(deps.saveIdentity).not.toHaveBeenCalled();
      expect(logs).toContain('token-derby login');
    });

    describe('when registration fails', () => {
      const failing = () => vi.fn().mockRejectedValue(new ApiError('RATE_LIMITED', 'Too many device registrations.', 429));

      it('still succeeds, because the link itself already landed', async () => {
        const deps = linkRun({ register: failing() });
        const { rc, logs } = await run(deps);

        // State, not just wording: the link is reported done and the command
        // does not present a completed link as a total failure.
        expect(rc).toBe(0);
        expect(logs).toContain('✓ Linked to omar@stackone.com.');
        expect(logs).toMatch(/linked — that part is done/i);
      });

      it('names `token-derby login` as the way to finish', async () => {
        const deps = linkRun({ register: failing() });
        const { logs } = await run(deps);

        expect(logs).toContain('token-derby login');
      });

      it('never writes a credential it did not receive', async () => {
        const deps = linkRun({ linkedName: 'Omar', register: failing() });
        await run(deps);

        // Nothing to write: the name was unchanged and no token came back, so
        // identity.json keeps the working legacy credential rather than being
        // clobbered with a placeholder.
        expect(deps.saveIdentity).not.toHaveBeenCalled();
      });

      it('still lands the rename, which is the write this command always owed', async () => {
        const deps = linkRun({ linkedName: 'Om', register: failing() });
        await run(deps);

        expect(deps.saveIdentity).toHaveBeenCalledTimes(1);
        const written = deps.saveIdentity.mock.calls[0]![0] as Identity;
        expect(written.display_name).toBe('Om');
        // The credential survives untouched — the machine is still on the
        // legacy token and has to keep working with it until `login` runs.
        expect(written.secret_token).toBe('legacy-account-token');
      });

      it('does not roll the link back or re-run it', async () => {
        const deps = linkRun({ register: failing() });
        const { logs } = await run(deps);

        // Two calls: the initial already-linked check and the one poll that saw
        // the email. A retry loop here would re-open a window that is closed.
        expect(deps.apiGetJockey).toHaveBeenCalledTimes(2);
        expect(logs).not.toMatch(/run `token-derby link` again/i);
      });
    });

    describe('a machine that already has its own credential', () => {
      /** `login` then `link`: the machine polls on a device credential. */
      function alreadyDeviceRun(overrides: { linkedName?: string } = {}) {
        const linkedName = overrides.linkedName ?? 'Omar';
        const apiGetJockey = vi.fn()
          .mockResolvedValueOnce(jockey({ display_name: 'Omar', device_label: 'omars-macbook' }))
          .mockResolvedValueOnce(jockey({
            display_name: linkedName, email: 'omar@stackone.com', device_label: 'omars-macbook',
          }));
        const loadIdentity = vi.fn().mockResolvedValue(
          identity({ display_name: 'Omar', secret_token: 'device-token-1' }),
        );
        return {
          apiGetJockey, loadIdentity,
          saveIdentity: vi.fn().mockResolvedValue(undefined),
          apiRegisterDevice: okRegister(),
        };
      }

      it('links the email and registers nothing', async () => {
        const deps = alreadyDeviceRun();
        const { rc, logs } = await run(deps);

        expect(rc).toBe(0);
        expect(logs).toContain('✓ Linked to omar@stackone.com.');
        // The credential this machine holds is the one a revoke is supposed to
        // kill. A second one would survive that revoke with nothing on disk
        // holding it — invisible in the Account view next to the live row.
        expect(deps.apiRegisterDevice).not.toHaveBeenCalled();
      });

      it('leaves the credential on disk exactly as it found it', async () => {
        const deps = alreadyDeviceRun();
        await run(deps);

        // Nothing was minted, so nothing may overwrite the working credential.
        expect(deps.saveIdentity).not.toHaveBeenCalled();
      });

      it('says why, naming the credential it already has', async () => {
        const deps = alreadyDeviceRun();
        const { logs } = await run(deps);

        // Silence here reads as "registration failed" on a command whose own
        // help text promises to register the machine.
        expect(logs).toMatch(/already has its own credential, "omars-macbook"/);
        expect(logs).not.toMatch(/is now registered as/);
      });

      it('still lands the rename the link caused', async () => {
        const deps = alreadyDeviceRun({ linkedName: 'Om' });
        await run(deps);

        // The write this command has always owed, independent of devices.
        expect(deps.apiRegisterDevice).not.toHaveBeenCalled();
        expect(deps.saveIdentity).toHaveBeenCalledWith(expect.objectContaining({
          display_name: 'Om',
          secret_token: 'device-token-1',
        }));
      });
    });

    describe('naming this machine', () => {
      it('takes --device-name over anything else, without prompting', async () => {
        const deps = linkRun();
        const promptText = vi.fn().mockResolvedValue('typed-name');
        await run(deps, ['--device-name', 'flag-name'], { isTTY: true, promptText });

        expect(deps.apiRegisterDevice).toHaveBeenCalledWith({ label: 'flag-name' });
        expect(promptText).not.toHaveBeenCalled();
      });

      it('accepts --device-name=<name> too', async () => {
        const deps = linkRun();
        await run(deps, ['--device-name=equals-name'], { isTTY: true, promptText: vi.fn() });

        expect(deps.apiRegisterDevice).toHaveBeenCalledWith({ label: 'equals-name' });
      });

      it('prompts with the hostname pre-filled when there is a TTY and no flag', async () => {
        const deps = linkRun();
        const promptText = vi.fn().mockResolvedValue('typed-name');
        await run(deps, [], { isTTY: true, promptText });

        expect(promptText).toHaveBeenCalledWith(expect.stringContaining('omars-macbook'));
        expect(deps.apiRegisterDevice).toHaveBeenCalledWith({ label: 'typed-name' });
      });

      it('keeps the hostname when the prompt is answered with nothing', async () => {
        const deps = linkRun();
        await run(deps, [], { isTTY: true, promptText: vi.fn().mockResolvedValue('   ') });

        expect(deps.apiRegisterDevice).toHaveBeenCalledWith({ label: 'omars-macbook' });
      });

      it('falls back to the hostname with no TTY, without waiting on a prompt', async () => {
        const deps = linkRun();
        // A prompt that never settles: if the no-TTY path ever asked, this test
        // would hang rather than fail, which is exactly the production symptom
        // (a `link` in CI or over SSH stuck forever on a question nothing answers).
        const promptText = vi.fn(() => new Promise<string>(() => {}));
        const { rc } = await run(deps, [], { isTTY: false, promptText });

        expect(rc).toBe(0);
        expect(promptText).not.toHaveBeenCalled();
        expect(deps.apiRegisterDevice).toHaveBeenCalledWith({ label: 'omars-macbook' });
      });

      it('rejects a bad --device-name before spending the browser leg', async () => {
        const deps = linkRun();
        const { rc, errors } = await run(deps, ['--device-name', 'laptop\nadmin']);

        expect(rc).toBe(1);
        // Nothing started: the label is only sent at the very end, so catching
        // it here is the difference between a typo costing a message and a typo
        // costing five minutes of waiting on a browser.
        expect(deps.apiGetJockey).not.toHaveBeenCalled();
        expect(deps.apiRegisterDevice).not.toHaveBeenCalled();
        expect(errors).toMatch(/--device-name/);
        expect(errors).toMatch(/control or invisible/);
      });

      it('rejects an over-long --device-name up front too', async () => {
        const deps = linkRun();
        const { rc, errors } = await run(deps, [`--device-name=${'x'.repeat(41)}`]);

        expect(rc).toBe(1);
        expect(deps.apiGetJockey).not.toHaveBeenCalled();
        expect(errors).toMatch(/1–40 characters/);
      });

      it('lets a label the server would accept through untouched', async () => {
        const deps = linkRun();
        const { rc } = await run(deps, ['--device-name', "Amélie's PC"]);

        // The pre-flight check must not be stricter than the server's, or it
        // rejects names `login` accepts.
        expect(rc).toBe(0);
        expect(deps.apiRegisterDevice).toHaveBeenCalledWith({ label: "Amélie's PC" });
      });

      it('re-prompts when the server rejects the label, the way `login` does', async () => {
        const register = vi.fn()
          .mockRejectedValueOnce(new ApiError('BAD_REQUEST', 'label may not contain control or invisible characters', 400))
          .mockResolvedValueOnce(registration());
        const deps = linkRun({ register });
        const promptText = vi.fn()
          .mockResolvedValueOnce('badname')   // the device-name prompt
          .mockResolvedValueOnce('good-name');      // the retry
        const { rc, logs } = await run(deps, [], { isTTY: true, promptText });

        expect(rc).toBe(0);
        expect(register.mock.calls.map((c) => c[0])).toEqual([
          { label: 'badname' }, { label: 'good-name' },
        ]);
        // State: the retry is what got written, and it is reported as the name.
        expect(deps.saveIdentity).toHaveBeenCalledWith(expect.objectContaining({
          secret_token: 'fresh-device-token',
        }));
        expect(logs).toMatch(/registered as "good-name"/);
      });

      it('gives up on a rejected label with no TTY rather than looping', async () => {
        const register = vi.fn().mockRejectedValue(
          new ApiError('BAD_REQUEST', 'label may not contain control or invisible characters', 400),
        );
        const deps = linkRun({ register });
        // Would hang instead of failing if the no-TTY path ever asked.
        const promptText = vi.fn(() => new Promise<string>(() => {}));
        const { rc, logs } = await run(deps, [], { isTTY: false, promptText });

        expect(rc).toBe(0); // the link itself still landed
        expect(register).toHaveBeenCalledTimes(1);
        expect(promptText).not.toHaveBeenCalled();
        expect(logs).toContain('token-derby login');
      });

      it('never attaches to stdin with no TTY, so it runs unattended over SSH or in CI', async () => {
        const stdinOn = vi.spyOn(process.stdin, 'on');
        const deps = linkRun();
        try {
          const { rc } = await run(deps, [], { isTTY: false, promptText: undefined });
          expect(rc).toBe(0);
        } finally {
          stdinOn.mockRestore();
        }

        // The real prompt builds a readline interface, which attaches to stdin.
        // With promptText left at its default, this is the guard that the no-TTY
        // path genuinely never reaches it — and the label proves the naming path
        // actually ran, so this cannot pass by registering nothing.
        expect(stdinOn).not.toHaveBeenCalled();
        expect(deps.apiRegisterDevice).toHaveBeenCalledWith({ label: 'omars-macbook' });
      });
    });

    it('brings a stale local name back in line on an already-linked account', async () => {
      const apiGetJockey = vi.fn().mockResolvedValue(
        jockey({ display_name: 'Om', email: 'omar@stackone.com' }),
      );
      const loadIdentity = vi.fn().mockResolvedValue(identity({ display_name: 'Omar' }));
      const saveIdentity = vi.fn().mockResolvedValue(undefined);
      const apiRegisterDevice = okRegister();
      const con = captureConsole();

      let rc: number;
      try {
        rc = await linkCommand([], {
          ...baseDeps(), apiGetJockey, apiCreateWebSession: vi.fn(), apiRegisterDevice,
          loadIdentity, saveIdentity,
        });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      // The name is synced, and the credential is left exactly as it was: this
      // branch did no linking, so it has nothing to migrate.
      expect(saveIdentity).toHaveBeenCalledWith(expect.objectContaining({
        display_name: 'Om',
        secret_token: 'legacy-account-token',
      }));
      expect(apiRegisterDevice).not.toHaveBeenCalled();
    });
  });

  it('surfaces an ApiError from the initial check without minting a grant', async () => {
    const apiGetJockey = vi.fn().mockRejectedValue(new ApiError('UNAUTHENTICATED', 'no credential', 401));
    const apiCreateWebSession = vi.fn();
    const apiRegisterDevice = okRegister();
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand([], {
        ...baseDeps(), apiGetJockey, apiCreateWebSession, apiRegisterDevice,
        loadIdentity: vi.fn().mockResolvedValue(null), saveIdentity: vi.fn(),
      });
    } finally {
      con.restore();
    }

    expect(rc).toBe(1);
    expect(apiCreateWebSession).not.toHaveBeenCalled();
    expect(apiRegisterDevice).not.toHaveBeenCalled();
    // Not a bare `Error: UNAUTHENTICATED Invalid token`: this is the revoked
    // -machine state, and `logout` already names the cause and the next step.
    const errors = con.errors.join('\n');
    expect(errors).toMatch(/no longer valid/i);
    expect(errors).toContain('token-derby login');
  });
});
