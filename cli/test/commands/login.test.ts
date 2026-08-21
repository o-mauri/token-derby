import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loginCommand, parseDeviceNameFlag } from '../../src/commands/login.js';
import { ApiError } from '../../src/api/client.js';
import type { Identity } from '../../src/identity/identity.js';
import type { CliAuthPollApprovedResponse, CliAuthStartResponse } from '@token-derby/shared';

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

  it('surfaces a non-BAD_REQUEST start error and does not poll', async () => {
    const apiStart = vi.fn().mockRejectedValue(new ApiError('RATE_LIMITED', 'slow down', 429));
    const apiPoll = vi.fn();
    const con = captureConsole();

    let rc: number;
    try {
      rc = await loginCommand(['--device-name', 'x'], {
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
        apiStart, apiPoll, apiRevokeDevice: vi.fn(), saveIdentity: vi.fn(),
        sleepImpl: vi.fn(), isTTY: true, hostname: () => 'x',
      });
    } finally {
      con.restore();
    }

    expect(rc).toBe(1);
    expect(apiPoll).toHaveBeenCalledTimes(1);
  });
});
