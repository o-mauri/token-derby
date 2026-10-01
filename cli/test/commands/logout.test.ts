import { describe, it, expect, vi } from 'vitest';
import { logoutCommand } from '../../src/commands/logout.js';
import { ApiError } from '../../src/api/client.js';
import type { LogoutDeviceResponse } from '@token-derby/shared';

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

describe('logoutCommand', () => {
  it('deletes the device server-side, then clears identity.json', async () => {
    const order: string[] = [];
    const apiLogoutDevice = vi.fn(async (): Promise<LogoutDeviceResponse> => {
      order.push('api');
      return { revoked: true };
    });
    const deleteIdentity = vi.fn(async () => { order.push('identity'); });
    const con = captureConsole();

    let rc: number;
    try {
      rc = await logoutCommand({ apiLogoutDevice, deleteIdentity });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    expect(apiLogoutDevice).toHaveBeenCalledTimes(1);
    expect(deleteIdentity).toHaveBeenCalledTimes(1);
    // The revoked branch must SAY it revoked. Behaviour alone is covered by the
    // call counts above, so without this the branch could stop firing unnoticed.
    expect(con.logs.join('\n')).toContain("Revoked this device's credential on the server.");
    // The load-bearing assertion: server-side delete happens BEFORE the local
    // file is cleared, not just that both happened.
    expect(order).toEqual(['api', 'identity']);
  });

  it('a legacy credential with no device row reports it plainly and still clears the file', async () => {
    const apiLogoutDevice = vi.fn(async (): Promise<LogoutDeviceResponse> => ({ revoked: false }));
    const deleteIdentity = vi.fn(async () => {});
    const con = captureConsole();

    let rc: number;
    try {
      rc = await logoutCommand({ apiLogoutDevice, deleteIdentity });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    expect(deleteIdentity).toHaveBeenCalledTimes(1);
    expect(con.logs.join('\n')).toMatch(/legacy/i);
    expect(con.errors.join('\n')).toBe('');
  });

  it('leaves identity.json in place when the server call fails, so the user can retry', async () => {
    const apiLogoutDevice = vi.fn().mockRejectedValue(new ApiError('NETWORK_ERROR', 'fetch failed', 0));
    const deleteIdentity = vi.fn(async () => {});
    const con = captureConsole();

    let rc: number;
    try {
      rc = await logoutCommand({ apiLogoutDevice, deleteIdentity });
    } finally {
      con.restore();
    }

    expect(rc).toBe(1);
    // This is the ordering guarantee: a failed server call must never reach
    // the local file deletion, or the user is stuck with no way to retry.
    expect(deleteIdentity).not.toHaveBeenCalled();
    expect(con.errors.join('\n')).toContain('NETWORK_ERROR');
  });

  it('reports a plain error for a non-auth ApiError, without a stack trace', async () => {
    const apiLogoutDevice = vi.fn().mockRejectedValue(new ApiError('RATE_LIMITED', 'slow down', 429));
    const deleteIdentity = vi.fn(async () => {});
    const con = captureConsole();

    let rc: number;
    try {
      rc = await logoutCommand({ apiLogoutDevice, deleteIdentity });
    } finally {
      con.restore();
    }

    expect(rc).toBe(1);
    expect(deleteIdentity).not.toHaveBeenCalled();
    expect(con.errors.join('\n')).toContain('RATE_LIMITED');
    expect(con.errors.join('\n')).not.toContain('at ');
  });

  it('clears the local file on a 401 from an already-revoked credential, since retrying cannot help', async () => {
    const apiLogoutDevice = vi.fn().mockRejectedValue(new ApiError('UNAUTHENTICATED', 'Invalid token', 401));
    const deleteIdentity = vi.fn(async () => {});
    const con = captureConsole();

    let rc: number;
    try {
      rc = await logoutCommand({ apiLogoutDevice, deleteIdentity });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    expect(deleteIdentity).toHaveBeenCalledTimes(1);
    expect(con.errors.join('\n')).toMatch(/already invalid|already revoked/i);
  });

  it('rethrows an unexpected non-ApiError instead of swallowing it', async () => {
    const boom = new Error('boom');
    const apiLogoutDevice = vi.fn().mockRejectedValue(boom);
    const deleteIdentity = vi.fn(async () => {});

    await expect(logoutCommand({ apiLogoutDevice, deleteIdentity })).rejects.toBe(boom);
    expect(deleteIdentity).not.toHaveBeenCalled();
  });
});
