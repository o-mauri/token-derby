import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loginCommand, parseDeviceNameFlag } from '../../src/commands/login.js';
import { ApiError } from '../../src/api/client.js';
import type { Identity } from '../../src/identity/identity.js';
import type { CliAuthPollApprovedResponse, CliAuthStartResponse, WebSessionCreateResponse } from '@token-derby/shared';

let quietLog: typeof console.log;
beforeEach(() => {
  quietLog = console.log;
  console.log = () => {};
});
afterEach(() => {
  console.log = quietLog;
});

function startResponse(overrides: Partial<CliAuthStartResponse> = {}): CliAuthStartResponse {
  return {
    device_code: 'dc-1',
    user_code: 'ABCD-EFGH',
    verification_uri: 'https://token-derby.mauricode.co.uk/cli',
    interval: 5,
    expires_in: 600,
    ...overrides,
  };
}

function approvedResponse(overrides: Partial<CliAuthPollApprovedResponse> = {}): CliAuthPollApprovedResponse {
  return {
    status: 'approved',
    user_id: 'user-1',
    secret_token: 'device-secret-token',
    device_id: 'device-1',
    display_name: 'Omar',
    email: 'omar@stackone.com',
    horses: 7,
    orgs: 2,
    ...overrides,
  };
}

function pending() {
  return { status: 'pending' as const };
}

function webSession(overrides: Partial<WebSessionCreateResponse> = {}): WebSessionCreateResponse {
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

describe('parseDeviceNameFlag', () => {
  it('parses --device-name <name>', () => {
    expect(parseDeviceNameFlag(['--device-name', 'my-mac'])).toBe('my-mac');
  });
  it('parses --device-name=<name>', () => {
    expect(parseDeviceNameFlag(['--device-name=my-mac'])).toBe('my-mac');
  });
  it('returns null when the flag is absent', () => {
    expect(parseDeviceNameFlag([])).toBeNull();
  });
});

describe('loginCommand', () => {
  it('uses --device-name over both the prompt and the hostname', async () => {
    const apiStart = vi.fn().mockResolvedValue(startResponse());
    const apiPoll = vi.fn().mockResolvedValue(approvedResponse());
    const promptText = vi.fn();
    const promptYesNo = vi.fn().mockResolvedValue(true);
    const saveIdentity = vi.fn().mockResolvedValue(undefined);

    const rc = await loginCommand(['--device-name', 'explicit-name'], {
      loadIdentity: async () => null,
      apiStart, apiPoll, apiRevokeDevice: vi.fn(), saveIdentity, promptText, promptYesNo,
      sleepImpl: vi.fn().mockResolvedValue(undefined), isTTY: true, hostname: () => 'should-not-be-used',
    });

    expect(rc).toBe(0);
    expect(apiStart).toHaveBeenCalledWith({ label: 'explicit-name' });
    expect(promptText).not.toHaveBeenCalled();
  });

  it('prompts on a TTY with the hostname pre-filled, and an empty answer accepts it', async () => {
    const apiStart = vi.fn().mockResolvedValue(startResponse());
    const apiPoll = vi.fn().mockResolvedValue(approvedResponse());
    const promptText = vi.fn().mockResolvedValue('');
    const promptYesNo = vi.fn().mockResolvedValue(true);
    const saveIdentity = vi.fn().mockResolvedValue(undefined);

    const rc = await loginCommand([], {
      loadIdentity: async () => null,
      apiStart, apiPoll, apiRevokeDevice: vi.fn(), saveIdentity, promptText, promptYesNo,
      sleepImpl: vi.fn().mockResolvedValue(undefined), isTTY: true, hostname: () => 'my-macbook',
    });

    expect(rc).toBe(0);
    expect(promptText).toHaveBeenCalledWith(expect.stringContaining('my-macbook'));
    expect(apiStart).toHaveBeenCalledWith({ label: 'my-macbook' });
  });

  it('uses whatever non-empty name the TTY user types instead of the hostname default', async () => {
    const apiStart = vi.fn().mockResolvedValue(startResponse());
    const apiPoll = vi.fn().mockResolvedValue(approvedResponse());
    const promptText = vi.fn().mockResolvedValue('typed-name');
    const promptYesNo = vi.fn().mockResolvedValue(true);

    await loginCommand([], {
      loadIdentity: async () => null,
      apiStart, apiPoll, apiRevokeDevice: vi.fn(), saveIdentity: vi.fn(), promptText, promptYesNo,
      sleepImpl: vi.fn(), isTTY: true, hostname: () => 'my-macbook',
    });

    expect(apiStart).toHaveBeenCalledWith({ label: 'typed-name' });
  });

  it('does not prompt and does not hang when there is no TTY, and says the confirm was skipped', async () => {
    const apiStart = vi.fn().mockResolvedValue(startResponse());
    const apiPoll = vi.fn().mockResolvedValue(approvedResponse());
    const promptText = vi.fn();
    const promptYesNo = vi.fn();
    const saveIdentity = vi.fn().mockResolvedValue(undefined);
    const con = captureConsole();

    let rc: number;
    try {
      rc = await loginCommand([], {
        loadIdentity: async () => null,
        apiStart, apiPoll, apiRevokeDevice: vi.fn(), saveIdentity, promptText, promptYesNo,
        sleepImpl: vi.fn().mockResolvedValue(undefined), isTTY: false, hostname: () => 'headless-box',
      });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    expect(promptText).not.toHaveBeenCalled();
    // No TTY to ask the confirm question either — the flow takes the
    // prompt's own default (yes) rather than block on an unanswerable question.
    expect(promptYesNo).not.toHaveBeenCalled();
    expect(apiStart).toHaveBeenCalledWith({ label: 'headless-box' });
    expect(saveIdentity).toHaveBeenCalled();
    // A reader of a CI log should be told the confirm was bypassed, not left
    // to infer it from the absence of a question.
    expect(con.logs.join('\n')).toMatch(/no tty.*confirm|confirm.*automatically/i);
  });

  it('polls repeatedly while pending and stops as soon as it is approved', async () => {
    const apiStart = vi.fn().mockResolvedValue(startResponse());
    const apiPoll = vi.fn()
      .mockResolvedValueOnce(pending())
      .mockResolvedValueOnce(pending())
      .mockResolvedValueOnce(approvedResponse());
    const promptYesNo = vi.fn().mockResolvedValue(true);
    const saveIdentity = vi.fn().mockResolvedValue(undefined);
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    const rc = await loginCommand(['--device-name', 'x'], {
      loadIdentity: async () => null,
      apiStart, apiPoll, apiRevokeDevice: vi.fn(), saveIdentity, promptYesNo,
      sleepImpl, isTTY: true, hostname: () => 'x',
    });

    expect(rc).toBe(0);
    expect(apiPoll).toHaveBeenCalledTimes(3);
    expect(apiPoll).toHaveBeenCalledWith({ device_code: 'dc-1' });
    // One sleep between each pending poll, none after the approved one.
    expect(sleepImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledWith(5000);
  });

  it('declining writes nothing and revokes the device', async () => {
    const apiStart = vi.fn().mockResolvedValue(startResponse());
    const approved = approvedResponse();
    const apiPoll = vi.fn().mockResolvedValue(approved);
    const apiRevokeDevice = vi.fn().mockResolvedValue({ ok: true });
    const promptYesNo = vi.fn().mockResolvedValue(false);
    const saveIdentity = vi.fn().mockResolvedValue(undefined);

    const rc = await loginCommand(['--device-name', 'x'], {
      loadIdentity: async () => null,
      apiStart, apiPoll, apiRevokeDevice, saveIdentity, promptYesNo,
      sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
    });

    expect(rc).toBe(0);
    expect(saveIdentity).not.toHaveBeenCalled();
    expect(apiRevokeDevice).toHaveBeenCalledWith(approved.device_id, {
      user_id: approved.user_id, secret_token: approved.secret_token,
    });
  });

  it('reports an error but still returns non-zero if the revoke itself fails on decline', async () => {
    const apiStart = vi.fn().mockResolvedValue(startResponse());
    const apiPoll = vi.fn().mockResolvedValue(approvedResponse());
    const apiRevokeDevice = vi.fn().mockRejectedValue(new ApiError('DEVICE_NOT_FOUND', 'gone', 404));
    const promptYesNo = vi.fn().mockResolvedValue(false);
    const saveIdentity = vi.fn().mockResolvedValue(undefined);
    const con = captureConsole();

    let rc: number;
    try {
      rc = await loginCommand(['--device-name', 'x'], {
        loadIdentity: async () => null,
        apiStart, apiPoll, apiRevokeDevice, saveIdentity, promptYesNo,
        sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
      });
    } finally {
      con.restore();
    }

    expect(rc).toBe(1);
    expect(saveIdentity).not.toHaveBeenCalled();
    expect(con.errors.join('\n')).toContain('could not revoke');
  });

  it('accepting writes identity.json with the device token in secret_token', async () => {
    const apiStart = vi.fn().mockResolvedValue(startResponse());
    const approved = approvedResponse();
    const apiPoll = vi.fn().mockResolvedValue(approved);
    const promptYesNo = vi.fn().mockResolvedValue(true);
    let savedIdentity: Identity | undefined;
    const saveIdentity = vi.fn(async (identity: Identity) => { savedIdentity = identity; });

    const rc = await loginCommand(['--device-name', 'x'], {
      loadIdentity: async () => null,
      apiStart, apiPoll, apiRevokeDevice: vi.fn(), saveIdentity, promptYesNo,
      sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
    });

    expect(rc).toBe(0);
    expect(savedIdentity).toBeDefined();
    expect(savedIdentity!.secret_token).toBe(approved.secret_token);
    expect(savedIdentity!.user_id).toBe(approved.user_id);
    expect(savedIdentity!.display_name).toBe(approved.display_name);
  });

  it('reports a rejected label clearly and lets a TTY user try a different one', async () => {
    const apiStart = vi.fn()
      .mockRejectedValueOnce(new ApiError('BAD_REQUEST', 'label may not contain control or invisible characters', 400))
      .mockResolvedValueOnce(startResponse());
    const apiPoll = vi.fn().mockResolvedValue(approvedResponse());
    const promptText = vi.fn().mockResolvedValue('a-clean-name');
    const promptYesNo = vi.fn().mockResolvedValue(true);
    const saveIdentity = vi.fn().mockResolvedValue(undefined);
    const con = captureConsole();

    let rc: number;
    try {
      rc = await loginCommand(['--device-name', 'bad name'], {
        loadIdentity: async () => null,
        apiStart, apiPoll, apiRevokeDevice: vi.fn(), saveIdentity, promptText, promptYesNo,
        sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
      });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    expect(apiStart).toHaveBeenCalledTimes(2);
    expect(apiStart).toHaveBeenNthCalledWith(2, { label: 'a-clean-name' });
    expect(promptText).toHaveBeenCalled();
    expect(con.errors.join('\n')).toContain('control or invisible characters');
  });

  it('exits without prompting when a rejected label cannot be retried (no TTY)', async () => {
    const apiStart = vi.fn().mockRejectedValue(new ApiError('BAD_REQUEST', 'bad label', 400));
    const promptText = vi.fn();
    const con = captureConsole();

    let rc: number;
    try {
      rc = await loginCommand(['--device-name', 'bad'], {
        loadIdentity: async () => null,
        apiStart, apiPoll: vi.fn(), apiRevokeDevice: vi.fn(), saveIdentity: vi.fn(), promptText,
        sleepImpl: vi.fn(), isTTY: false, hostname: () => 'x',
      });
    } finally {
      con.restore();
    }

    expect(rc).toBe(1);
    expect(promptText).not.toHaveBeenCalled();
    expect(apiStart).toHaveBeenCalledTimes(1);
  });

  it('degrades the confirm prompt when there is no email, without printing "undefined"', async () => {
    const apiStart = vi.fn().mockResolvedValue(startResponse());
    const approved = approvedResponse();
    delete (approved as Partial<CliAuthPollApprovedResponse>).email;
    const apiPoll = vi.fn().mockResolvedValue(approved);
    const promptYesNo = vi.fn().mockResolvedValue(true);
    const con = captureConsole();

    let rc: number;
    try {
      rc = await loginCommand(['--device-name', 'x'], {
        loadIdentity: async () => null,
        apiStart, apiPoll, apiRevokeDevice: vi.fn(), saveIdentity: vi.fn(), promptYesNo,
        sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
      });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    expect(con.logs.join('\n')).not.toContain('undefined');
    expect(con.logs.join('\n')).not.toContain('Signed in as');
    expect(con.logs.join('\n')).toContain('Linking to your existing jockey');
  });

  it('prints the user_code and the bare verification_uri, never a URL with the code baked in', async () => {
    const apiStart = vi.fn().mockResolvedValue(startResponse({
      verification_uri: 'https://token-derby.mauricode.co.uk/cli',
      user_code: 'WXYZ-1234',
    }));
    const apiPoll = vi.fn().mockResolvedValue(approvedResponse());
    const promptYesNo = vi.fn().mockResolvedValue(true);
    const con = captureConsole();

    try {
      await loginCommand(['--device-name', 'x'], {
        loadIdentity: async () => null,
        apiStart, apiPoll, apiRevokeDevice: vi.fn(), saveIdentity: vi.fn(), promptYesNo,
        sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
      });
    } finally {
      con.restore();
    }

    const out = con.logs.join('\n');
    expect(out).toContain('https://token-derby.mauricode.co.uk/cli');
    expect(out).toContain('WXYZ-1234');
    expect(out).not.toContain('https://token-derby.mauricode.co.uk/cli?');
    expect(out).not.toContain('https://token-derby.mauricode.co.uk/cliWXYZ-1234');
    expect(out).not.toMatch(/cli\/WXYZ-1234/);
  });

  it('prints the bare URL and never mints a grant when there is no local identity', async () => {
    const apiStart = vi.fn().mockResolvedValue(startResponse({ verification_uri: 'https://token-derby.mauricode.co.uk/cli' }));
    const apiPoll = vi.fn().mockResolvedValue(approvedResponse());
    const promptYesNo = vi.fn().mockResolvedValue(true);
    const apiCreateWebSession = vi.fn();
    const con = captureConsole();

    let rc: number;
    try {
      rc = await loginCommand(['--device-name', 'x'], {
        loadIdentity: async () => null,
        apiStart, apiPoll, apiRevokeDevice: vi.fn(), apiCreateWebSession,
        saveIdentity: vi.fn().mockResolvedValue(undefined), promptYesNo,
        sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
      });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    // Not just that the printed URL lacks a fragment — the mint call itself
    // must never happen for an account with nothing to mint a credential from.
    expect(apiCreateWebSession).not.toHaveBeenCalled();
    const out = con.logs.join('\n');
    expect(out).toContain('https://token-derby.mauricode.co.uk/cli');
    expect(out).not.toContain('#code=');
  });

  it('surfaces a non-BAD_REQUEST start error and does not poll', async () => {
    const apiStart = vi.fn().mockRejectedValue(new ApiError('RATE_LIMITED', 'slow down', 429));
    const apiPoll = vi.fn();
    const con = captureConsole();

    let rc: number;
    try {
      rc = await loginCommand(['--device-name', 'x'], {
        loadIdentity: async () => null,
        apiStart, apiPoll, apiRevokeDevice: vi.fn(), saveIdentity: vi.fn(),
        sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
      });
    } finally {
      con.restore();
    }

    expect(rc).toBe(1);
    expect(apiPoll).not.toHaveBeenCalled();
    expect(con.errors.join('\n')).toContain('RATE_LIMITED');
  });

  it('surfaces a poll error and stops polling', async () => {
    const apiStart = vi.fn().mockResolvedValue(startResponse());
    const apiPoll = vi.fn().mockRejectedValue(new ApiError('BAD_REQUEST', 'device_code is required', 400));
    const con = captureConsole();

    let rc: number;
    try {
      rc = await loginCommand(['--device-name', 'x'], {
        loadIdentity: async () => null,
        apiStart, apiPoll, apiRevokeDevice: vi.fn(), saveIdentity: vi.fn(),
        sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
      });
    } finally {
      con.restore();
    }

    expect(rc).toBe(1);
    expect(apiPoll).toHaveBeenCalledTimes(1);
  });

  describe('the approval deadline', () => {
    // The server-side poll budget (CLI_POLL_LIMIT). Mirrored here so the mock
    // behaves like the real endpoint: an unapproved login that keeps polling
    // past its expiry eventually gets RATE_LIMITED, which is the wrong thing
    // to tell someone whose real problem is that nobody approved them.
    const SERVER_POLL_BUDGET = 240;

    function pollingUntilRateLimited() {
      let calls = 0;
      return vi.fn(async () => {
        calls++;
        if (calls > SERVER_POLL_BUDGET) {
          throw new ApiError('RATE_LIMITED', 'Too many poll attempts. Try again later.', 429);
        }
        return pending();
      });
    }

    it('gives up at expires_in and says it timed out, instead of polling on to RATE_LIMITED', async () => {
      vi.useFakeTimers();
      const start = startResponse({ expires_in: 600, interval: 5 });
      const apiPoll = pollingUntilRateLimited();
      const saveIdentity = vi.fn();
      // Time only moves when the command sleeps, so the fake clock advances
      // exactly one poll interval per loop and nothing waits in real time.
      const sleepImpl = vi.fn(async (ms: number) => { vi.advanceTimersByTime(ms); });
      const con = captureConsole();

      let rc: number;
      try {
        rc = await loginCommand(['--device-name', 'x'], {
          loadIdentity: async () => null,
          apiStart: vi.fn().mockResolvedValue(start), apiPoll, apiRevokeDevice: vi.fn(),
          saveIdentity, sleepImpl, isTTY: true, hostname: () => 'x',
        });
      } finally {
        con.restore();
        vi.useRealTimers();
      }

      expect(rc).toBe(1);
      expect(con.errors.join('\n')).toMatch(/timed out/i);
      // The wrong diagnosis, spelled out: without the deadline the loop runs to
      // the server's budget and blames rate limiting for nobody approving.
      expect(con.errors.join('\n')).not.toContain('RATE_LIMITED');
      expect(saveIdentity).not.toHaveBeenCalled();

      // Derived from the response's own numbers rather than hardcoded: one poll
      // at t=0 and one per interval up to and including the deadline.
      expect(apiPoll).toHaveBeenCalledTimes(start.expires_in / start.interval + 1);
    });

    it('still accepts an approval that arrives on the last interval before the deadline', async () => {
      vi.useFakeTimers();
      const start = startResponse({ expires_in: 600, interval: 5 });
      const lastPoll = start.expires_in / start.interval;
      let calls = 0;
      // Approves on the very last poll the deadline allows — an off-by-one in
      // the check would fail an honest login that only just made it.
      const apiPoll = vi.fn(async () => {
        calls++;
        return calls < lastPoll ? pending() : approvedResponse();
      });
      const saveIdentity = vi.fn().mockResolvedValue(undefined);
      const sleepImpl = vi.fn(async (ms: number) => { vi.advanceTimersByTime(ms); });
      const con = captureConsole();

      let rc: number;
      try {
        rc = await loginCommand(['--device-name', 'x'], {
          loadIdentity: async () => null,
          apiStart: vi.fn().mockResolvedValue(start), apiPoll, apiRevokeDevice: vi.fn(),
          saveIdentity, promptYesNo: vi.fn().mockResolvedValue(true), sleepImpl,
          isTTY: true, hostname: () => 'x',
        });
      } finally {
        con.restore();
        vi.useRealTimers();
      }

      expect(rc).toBe(0);
      expect(con.errors.join('\n')).not.toMatch(/timed out/i);
      expect(saveIdentity).toHaveBeenCalledTimes(1);
    });
  });

  describe('an identity.json that is already present', () => {
    const existing = {
      user_id: 'user-1',
      display_name: 'Omar',
      secret_token: 'old-account-token',
      created_at: '2026-01-01T00:00:00.000Z',
    };

    it('warns and asks first on a TTY, and does nothing when the answer is no', async () => {
      const apiStart = vi.fn();
      const saveIdentity = vi.fn();
      const promptYesNo = vi.fn().mockResolvedValue(false);
      const con = captureConsole();

      let rc: number;
      try {
        rc = await loginCommand(['--device-name', 'x'], {
          loadIdentity: async () => existing,
          apiStart, apiPoll: vi.fn(), apiRevokeDevice: vi.fn(), saveIdentity,
          promptYesNo, sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
        });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      // Declining must cost nothing: no /start call means no second code and no
      // second credential, which is the accumulation being prevented.
      expect(apiStart).not.toHaveBeenCalled();
      expect(saveIdentity).not.toHaveBeenCalled();
      expect(promptYesNo).toHaveBeenCalledTimes(1);
      expect(con.logs.join('\n')).toContain('already signed in as Omar');
    });

    it('proceeds when the answer is yes', async () => {
      const apiStart = vi.fn().mockResolvedValue(startResponse());
      const saveIdentity = vi.fn().mockResolvedValue(undefined);
      const promptYesNo = vi.fn().mockResolvedValue(true);
      const apiCreateWebSession = vi.fn().mockResolvedValue(webSession());
      const con = captureConsole();

      let rc: number;
      try {
        rc = await loginCommand(['--device-name', 'x'], {
          loadIdentity: async () => existing,
          apiStart, apiPoll: vi.fn().mockResolvedValue(approvedResponse()),
          apiRevokeDevice: vi.fn(), apiCreateWebSession, saveIdentity, promptYesNo,
          sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
        });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      expect(apiStart).toHaveBeenCalledTimes(1);
      expect(saveIdentity).toHaveBeenCalledTimes(1);
    });

    it('without a TTY, continues but says the previous credential is still active and where to revoke it', async () => {
      const apiStart = vi.fn().mockResolvedValue(startResponse());
      const promptYesNo = vi.fn();
      const apiCreateWebSession = vi.fn().mockResolvedValue(webSession());
      const con = captureConsole();

      let rc: number;
      try {
        rc = await loginCommand(['--device-name', 'x'], {
          loadIdentity: async () => existing,
          apiStart, apiPoll: vi.fn().mockResolvedValue(approvedResponse()),
          apiRevokeDevice: vi.fn(), apiCreateWebSession, saveIdentity: vi.fn().mockResolvedValue(undefined),
          promptYesNo, sleepImpl: vi.fn(), isTTY: false, hostname: () => 'x',
        });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      // No prompt without a terminal to answer it, but the log has to carry the
      // fact and the remedy — CI is exactly where these rows pile up unnoticed.
      expect(promptYesNo).not.toHaveBeenCalled();
      const logged = con.logs.join('\n');
      expect(logged).toContain('already signed in as Omar');
      expect(logged).toMatch(/stays active/i);
      expect(logged).toMatch(/revoke/i);
      expect(logged).toContain('token-derby web');
    });

    it('carries a minted grant in the printed URL, since a local identity exists to mint it from', async () => {
      const apiStart = vi.fn().mockResolvedValue(startResponse({ verification_uri: 'https://token-derby.mauricode.co.uk/cli' }));
      const apiPoll = vi.fn().mockResolvedValue(approvedResponse());
      const promptYesNo = vi.fn().mockResolvedValue(true);
      const apiCreateWebSession = vi.fn().mockResolvedValue(webSession({ code: 'GRANT-XYZ' }));
      const con = captureConsole();

      let rc: number;
      try {
        rc = await loginCommand(['--device-name', 'x'], {
          loadIdentity: async () => existing,
          apiStart, apiPoll, apiRevokeDevice: vi.fn(), apiCreateWebSession,
          saveIdentity: vi.fn().mockResolvedValue(undefined), promptYesNo,
          sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
        });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      expect(apiCreateWebSession).toHaveBeenCalledTimes(1);
      // The exact URL a browser would be sent to, fragment and all — not just
      // that a code appears somewhere in the log.
      expect(con.logs.join('\n')).toContain('https://token-derby.mauricode.co.uk/cli#code=GRANT-XYZ');
    });

    it('says the grant link is short-lived, matching what `web` and `link` already say', async () => {
      const con = captureConsole();
      try {
        await loginCommand(['--device-name', 'x'], {
          loadIdentity: async () => existing,
          apiStart: vi.fn().mockResolvedValue(startResponse()),
          apiPoll: vi.fn().mockResolvedValue(approvedResponse()),
          apiRevokeDevice: vi.fn(), apiCreateWebSession: vi.fn().mockResolvedValue(webSession()),
          saveIdentity: vi.fn().mockResolvedValue(undefined),
          promptYesNo: vi.fn().mockResolvedValue(true),
          sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
          spawnImpl: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })) as any,
        });
      } finally {
        con.restore();
      }

      // The 60s grant window, not the 600s code window the rest of the output
      // is about — a reader who only sees the latter waits out the wrong clock.
      expect(con.logs.join('\n')).toMatch(/expires in 60 seconds/);
    });

    it('does not claim a 60-second window on the bare URL, which has none', async () => {
      const con = captureConsole();
      try {
        await loginCommand(['--device-name', 'x'], {
          loadIdentity: async () => null,
          apiStart: vi.fn().mockResolvedValue(startResponse()),
          apiPoll: vi.fn().mockResolvedValue(approvedResponse()),
          apiRevokeDevice: vi.fn(), apiCreateWebSession: vi.fn(),
          saveIdentity: vi.fn().mockResolvedValue(undefined),
          promptYesNo: vi.fn().mockResolvedValue(true),
          sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
          spawnImpl: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })) as any,
        });
      } finally {
        con.restore();
      }

      expect(con.logs.join('\n')).not.toMatch(/60 seconds/);
    });

    describe('a credential the server no longer accepts', () => {
      it('falls back to the bare URL and completes the login instead of dead-ending', async () => {
        const apiStart = vi.fn().mockResolvedValue(startResponse({ verification_uri: 'https://token-derby.mauricode.co.uk/cli' }));
        const apiPoll = vi.fn().mockResolvedValue(approvedResponse());
        // Exactly what `create-web-session` returns once this machine has been
        // revoked from the Account view, or the account has been wiped.
        const apiCreateWebSession = vi.fn().mockRejectedValue(
          new ApiError('UNAUTHENTICATED', 'Invalid token', 401),
        );
        const saveIdentity = vi.fn().mockResolvedValue(undefined);
        const con = captureConsole();

        let rc: number;
        try {
          rc = await loginCommand(['--device-name', 'x'], {
            loadIdentity: async () => existing,
            apiStart, apiPoll, apiRevokeDevice: vi.fn(), apiCreateWebSession, saveIdentity,
            promptYesNo: vi.fn().mockResolvedValue(true),
            sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
          spawnImpl: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })) as any,
          });
        } finally {
          con.restore();
        }

        const logged = con.logs.join('\n');
        expect(rc).toBe(0);
        // The URL is the whole point: this is the only machine `login` can be
        // run from to recover a credential that was revoked on this machine.
        expect(logged).toContain('https://token-derby.mauricode.co.uk/cli');
        expect(logged).not.toContain('#code=');
        expect(apiPoll).toHaveBeenCalled();
        expect(saveIdentity).toHaveBeenCalledTimes(1);
      });

      it('says why the browser will ask for a fresh sign-in', async () => {
        const con = captureConsole();
        try {
          await loginCommand(['--device-name', 'x'], {
            loadIdentity: async () => existing,
            apiStart: vi.fn().mockResolvedValue(startResponse()),
            apiPoll: vi.fn().mockResolvedValue(approvedResponse()),
            apiRevokeDevice: vi.fn(),
            apiCreateWebSession: vi.fn().mockRejectedValue(new ApiError('UNAUTHENTICATED', 'Invalid token', 401)),
            saveIdentity: vi.fn().mockResolvedValue(undefined),
            promptYesNo: vi.fn().mockResolvedValue(true),
            sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
          spawnImpl: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })) as any,
          });
        } finally {
          con.restore();
        }

        const logged = con.logs.join('\n');
        expect(logged).toMatch(/no longer valid/i);
        expect(logged).toMatch(/sign you in fresh/i);
      });

      it('still aborts on a transient mint failure, before printing any URL', async () => {
        const apiStart = vi.fn().mockResolvedValue(startResponse({ verification_uri: 'https://token-derby.mauricode.co.uk/cli' }));
        const apiPoll = vi.fn();
        const saveIdentity = vi.fn();
        // Not UNAUTHENTICATED: nothing has been said about this credential, so
        // retrying is the right move and a bare-URL fallback would silently
        // start a second account.
        const apiCreateWebSession = vi.fn().mockRejectedValue(new ApiError('NETWORK_ERROR', 'fetch failed', 0));
        const con = captureConsole();

        let rc: number;
        try {
          rc = await loginCommand(['--device-name', 'x'], {
            loadIdentity: async () => existing,
            apiStart, apiPoll, apiRevokeDevice: vi.fn(), apiCreateWebSession, saveIdentity,
            promptYesNo: vi.fn().mockResolvedValue(true),
            sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
          spawnImpl: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })) as any,
          });
        } finally {
          con.restore();
        }

        expect(rc).toBe(1);
        expect(apiPoll).not.toHaveBeenCalled();
        expect(saveIdentity).not.toHaveBeenCalled();
        expect(con.logs.join('\n')).not.toContain('https://token-derby.mauricode.co.uk/cli');
        expect(con.errors.join('\n')).toContain('NETWORK_ERROR');
      });
    });

    it('says nothing and asks nothing when there is no identity.json', async () => {
      const promptYesNo = vi.fn().mockResolvedValue(true);
      const con = captureConsole();

      try {
        await loginCommand(['--device-name', 'x'], {
          loadIdentity: async () => null,
          apiStart: vi.fn().mockResolvedValue(startResponse()),
          apiPoll: vi.fn().mockResolvedValue(approvedResponse()),
          apiRevokeDevice: vi.fn(), saveIdentity: vi.fn().mockResolvedValue(undefined),
          promptYesNo, sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
        });
      } finally {
        con.restore();
      }

      // The one confirm a first-time login already had, not two.
      expect(promptYesNo).toHaveBeenCalledTimes(1);
      expect(con.logs.join('\n')).not.toMatch(/already signed in/i);
    });
  });
});

describe('opening the browser', () => {
  it('opens the verification URL and still prints it as the fallback', async () => {
    const apiStart = vi.fn(async () => startResponse());
    const apiPoll = vi.fn(async () => approvedResponse());
    const spawnImpl = vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })) as any;
    const con = captureConsole();
    try {
      await loginCommand([], {
        loadIdentity: async () => null,
        apiStart, apiPoll, apiRevokeDevice: vi.fn(), saveIdentity: vi.fn(),
        promptText: vi.fn(), promptYesNo: vi.fn(),
        sleepImpl: vi.fn(), isTTY: false, hostname: () => 'my-macbook',
        spawnImpl,
      });
    } finally { con.restore(); }

    // Opened with the same URL it printed — not a second, differently-built one.
    const opened = spawnImpl.mock.calls[0]?.[1]?.[0] as string | undefined;
    expect(opened).toBeTruthy();
    expect(con.logs.join('\n')).toContain(opened!);
  });
});
