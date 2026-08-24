import { describe, it, expect, vi, afterEach } from 'vitest';
import { linkCommand } from '../../src/commands/link.js';
import { ApiError } from '../../src/api/client.js';
import type { Identity } from '../../src/identity/identity.js';
import type { GetJockeyResponse, WebSessionCreateResponse } from '@token-derby/shared';

function identity(overrides: Partial<Identity> = {}): Identity {
  return {
    user_id: 'user-1',
    display_name: 'Omar',
    secret_token: 'secret-token',
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

afterEach(() => {
  vi.useRealTimers();
  delete process.env.TOKEN_DERBY_API_BASE;
});

describe('linkCommand', () => {
  it('already linked: prints the email, exits 0, and never mints a grant', async () => {
    const apiGetJockey = vi.fn().mockResolvedValue(jockey({ email: 'omar@stackone.com' }));
    const apiCreateWebSession = vi.fn();
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand({ apiGetJockey, apiCreateWebSession, sleepImpl: vi.fn(), loadIdentity: vi.fn().mockResolvedValue(null), saveIdentity: vi.fn() });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    expect(con.logs.join('\n')).toContain('Already linked to omar@stackone.com.');
    expect(apiCreateWebSession).not.toHaveBeenCalled();
    expect(apiGetJockey).toHaveBeenCalledTimes(1);
  });

  it('prints a /link URL carrying the minted grant, and opens it', async () => {
    process.env.TOKEN_DERBY_API_BASE = 'https://example.test/api';
    const apiGetJockey = vi.fn()
      .mockResolvedValueOnce(jockey())
      .mockResolvedValueOnce(jockey({ email: 'omar@stackone.com' }));
    const apiCreateWebSession = vi.fn().mockResolvedValue(session({ code: 'GRANT123' }));
    const spawnImpl = vi.fn(() => ({ on: () => {}, unref: () => {} })) as any;
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand({ apiGetJockey, apiCreateWebSession, spawnImpl, sleepImpl: vi.fn(), loadIdentity: vi.fn().mockResolvedValue(null), saveIdentity: vi.fn() });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    const out = con.logs.join('\n');
    expect(out).toContain('https://example.test/link#code=GRANT123');
    expect(spawnImpl).toHaveBeenCalled();
    const args = spawnImpl.mock.calls[0];
    expect(JSON.stringify(args)).toContain('https://example.test/link#code=GRANT123');
  });

  it('polls repeatedly while unlinked and stops as soon as the email appears', async () => {
    const apiGetJockey = vi.fn()
      .mockResolvedValueOnce(jockey())                                     // initial "already linked?" check
      .mockResolvedValueOnce(jockey())                                     // poll: still no email
      .mockResolvedValueOnce(jockey())                                     // poll: still no email
      .mockResolvedValueOnce(jockey({ email: 'omar@stackone.com' }));      // poll: linked
    const apiCreateWebSession = vi.fn().mockResolvedValue(session());
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand({ apiGetJockey, apiCreateWebSession, spawnImpl: vi.fn(() => ({ on: () => {}, unref: () => {} })) as any, sleepImpl, loadIdentity: vi.fn().mockResolvedValue(null), saveIdentity: vi.fn() });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    expect(apiGetJockey).toHaveBeenCalledTimes(4);
    // One sleep between each unlinked poll, none after the linked one.
    expect(sleepImpl).toHaveBeenCalledTimes(2);
    expect(con.logs.join('\n')).toContain('✓ Linked to omar@stackone.com.');
  });

  it('fails with an honest message and a non-zero exit once the bounded wait elapses', async () => {
    vi.useFakeTimers();
    const apiGetJockey = vi.fn().mockResolvedValue(jockey()); // never gains an email
    const apiCreateWebSession = vi.fn().mockResolvedValue(session());
    // Time only moves when the command sleeps, so the fake clock advances in
    // lockstep with the poll loop and nothing waits in real time.
    const sleepImpl = vi.fn(async (ms: number) => { vi.advanceTimersByTime(ms); });
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand({
        apiGetJockey, apiCreateWebSession,
        spawnImpl: vi.fn(() => ({ on: () => {}, unref: () => {} })) as any,
        sleepImpl, loadIdentity: vi.fn().mockResolvedValue(null), saveIdentity: vi.fn(),
      });
    } finally {
      con.restore();
      vi.useRealTimers();
    }

    expect(rc).toBe(1);
    expect(con.errors.join('\n')).toMatch(/timed out/i);
  });

  // Setting process.stdin.isTTY asserted nothing: linkCommand never reads it.
  // What is worth holding is the property underneath — the command runs
  // unattended, so it must never attach to stdin. readline.createInterface
  // does (`error`, `data`, `end`), so adding any prompt turns this red.
  it('never attaches to stdin, so it runs unattended over SSH or in CI', async () => {
    vi.useFakeTimers();
    const stdinOn = vi.spyOn(process.stdin, 'on');
    const apiGetJockey = vi.fn()
      .mockResolvedValueOnce(jockey())
      .mockResolvedValueOnce(jockey({ email: 'omar@stackone.com' }));
    const apiCreateWebSession = vi.fn().mockResolvedValue(session());
    const sleepImpl = vi.fn(async (ms: number) => { vi.advanceTimersByTime(ms); });
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand({
        apiGetJockey, apiCreateWebSession,
        spawnImpl: vi.fn(() => ({ on: () => {}, unref: () => {} })) as any,
        sleepImpl, loadIdentity: vi.fn().mockResolvedValue(null), saveIdentity: vi.fn(),
      });
    } finally {
      con.restore();
      vi.useRealTimers();
    }

    expect(rc).toBe(0);
    expect(stdinOn).not.toHaveBeenCalled();
  });

  describe('the rename a first link performs', () => {
    // The server sets the jockey name to the Google first name on a first
    // link. It is intended, but nothing used to say so, and identity.json kept
    // the old name — so `login`, `init` and the leaderboards disagreed.
    function linkRun(overrides: { linkedName?: string; local?: Identity | null } = {}) {
      const linkedName = overrides.linkedName ?? 'Om';
      const apiGetJockey = vi.fn()
        .mockResolvedValueOnce(jockey({ display_name: 'Omar' }))
        .mockResolvedValueOnce(jockey({ display_name: linkedName, email: 'omar@stackone.com' }));
      const loadIdentity = vi.fn().mockResolvedValue(
        overrides.local === undefined ? identity({ display_name: 'Omar' }) : overrides.local,
      );
      const saveIdentity = vi.fn().mockResolvedValue(undefined);
      return { apiGetJockey, loadIdentity, saveIdentity };
    }

    async function run(deps: ReturnType<typeof linkRun>) {
      const con = captureConsole();
      try {
        const rc = await linkCommand({
          ...deps,
          apiCreateWebSession: vi.fn().mockResolvedValue(session()),
          spawnImpl: vi.fn(() => ({ on: () => {}, unref: () => {} })) as any,
          sleepImpl: vi.fn(),
        });
        return { rc, logs: con.logs.join('\n') };
      } finally {
        con.restore();
      }
    }

    it('names the new jockey name in the output when the link changed it', async () => {
      const deps = linkRun({ linkedName: 'Om' });
      const { rc, logs } = await run(deps);

      expect(rc).toBe(0);
      expect(logs).toContain('now named Om');
      expect(logs).toMatch(/first name on the Google account/i);
    });

    it('says nothing about a rename when the name is unchanged', async () => {
      const deps = linkRun({ linkedName: 'Omar' });
      const { rc, logs } = await run(deps);

      expect(rc).toBe(0);
      expect(logs).toContain('✓ Linked to omar@stackone.com.');
      expect(logs).not.toMatch(/now named/i);
    });

    it('rewrites identity.json with the name the server now reports', async () => {
      const deps = linkRun({ linkedName: 'Om' });
      await run(deps);

      expect(deps.saveIdentity).toHaveBeenCalledTimes(1);
      expect(deps.saveIdentity).toHaveBeenCalledWith(expect.objectContaining({
        display_name: 'Om',
        // The credential must survive the rewrite untouched — it is the only
        // copy and this is not the command that rotates it.
        secret_token: 'secret-token',
        user_id: 'user-1',
      }));
    });

    it('leaves identity.json alone when the name already matches', async () => {
      const deps = linkRun({ linkedName: 'Omar' });
      await run(deps);

      expect(deps.saveIdentity).not.toHaveBeenCalled();
    });

    it('does not write an identity.json that is not there', async () => {
      const deps = linkRun({ linkedName: 'Om', local: null });
      const { rc } = await run(deps);

      expect(rc).toBe(0);
      expect(deps.saveIdentity).not.toHaveBeenCalled();
    });

    it('brings a stale local name back in line on an already-linked account', async () => {
      const apiGetJockey = vi.fn().mockResolvedValue(
        jockey({ display_name: 'Om', email: 'omar@stackone.com' }),
      );
      const loadIdentity = vi.fn().mockResolvedValue(identity({ display_name: 'Omar' }));
      const saveIdentity = vi.fn().mockResolvedValue(undefined);
      const con = captureConsole();

      let rc: number;
      try {
        rc = await linkCommand({ apiGetJockey, apiCreateWebSession: vi.fn(), loadIdentity, saveIdentity, sleepImpl: vi.fn() });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      expect(saveIdentity).toHaveBeenCalledWith(expect.objectContaining({ display_name: 'Om' }));
    });
  });

  it('surfaces an ApiError from the initial check without minting a grant', async () => {
    const apiGetJockey = vi.fn().mockRejectedValue(new ApiError('UNAUTHENTICATED', 'no credential', 401));
    const apiCreateWebSession = vi.fn();
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand({ apiGetJockey, apiCreateWebSession, loadIdentity: vi.fn().mockResolvedValue(null), saveIdentity: vi.fn() });
    } finally {
      con.restore();
    }

    expect(rc).toBe(1);
    expect(apiCreateWebSession).not.toHaveBeenCalled();
    // Not a bare `Error: UNAUTHENTICATED Invalid token`: this is the revoked
    // -machine state, and `logout` already names the cause and the next step.
    const errors = con.errors.join('\n');
    expect(errors).toMatch(/no longer valid/i);
    expect(errors).toContain('token-derby login');
  });
});
