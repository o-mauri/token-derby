import { describe, it, expect, vi, afterEach } from 'vitest';
import { initCommand } from '../../src/commands/init.js';
import { ApiError } from '../../src/api/client.js';
import type { Identity } from '../../src/identity/identity.js';
import type { GetJockeyResponse } from '@token-derby/shared';

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
  vi.restoreAllMocks();
});

describe('initCommand', () => {
  describe('deprecation notice', () => {
    it('appears on a plain init', async () => {
      const loadIdentity = vi.fn().mockResolvedValue(null);
      const initJockey = vi.fn().mockResolvedValue({ user_id: 'u', display_name: 'Omar', secret_token: 't' });
      const saveIdentity = vi.fn().mockResolvedValue(undefined);
      const promptText = vi.fn().mockResolvedValue('Omar');
      const con = captureConsole();

      let rc: number;
      try {
        rc = await initCommand(false, { loadIdentity, initJockey, saveIdentity, promptText });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      expect(con.logs.join('\n')).toMatch(/token-derby login.*only way to manage accounts/);
    });
  });

  describe('rename path (existing identity, no --reset)', () => {
    it('offers a rename and never warns about orphaning', async () => {
      const loadIdentity = vi.fn().mockResolvedValue(identity());
      const updateJockey = vi.fn().mockResolvedValue({ user_id: 'user-1', display_name: 'New Name' });
      const saveIdentity = vi.fn().mockResolvedValue(undefined);
      const apiGetJockey = vi.fn();
      const deleteIdentity = vi.fn();
      const promptText = vi.fn().mockResolvedValue('New Name');
      const con = captureConsole();

      let rc: number;
      try {
        rc = await initCommand(false, {
          loadIdentity, updateJockey, saveIdentity, apiGetJockey, deleteIdentity, promptText,
        });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      expect(saveIdentity).toHaveBeenCalledWith(expect.objectContaining({ display_name: 'New Name' }));
      expect(deleteIdentity).not.toHaveBeenCalled();
      expect(apiGetJockey).not.toHaveBeenCalled();
      const out = con.logs.join('\n');
      expect(out).toContain('Current jockey name: Omar');
      expect(out).not.toContain('abandon');
    });

    it('keeps the existing name when the answer is blank', async () => {
      const loadIdentity = vi.fn().mockResolvedValue(identity());
      const updateJockey = vi.fn();
      const saveIdentity = vi.fn();
      const promptText = vi.fn().mockResolvedValue('');
      const con = captureConsole();

      let rc: number;
      try {
        rc = await initCommand(false, { loadIdentity, updateJockey, saveIdentity, promptText });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      expect(updateJockey).not.toHaveBeenCalled();
      expect(saveIdentity).not.toHaveBeenCalled();
      expect(con.logs.join('\n')).toContain('Kept existing name.');
    });
  });

  describe('--reset', () => {
    it('on a TTY: warns, names the jockey, and does nothing if declined', async () => {
      const loadIdentity = vi.fn().mockResolvedValue(identity({ display_name: 'Omar' }));
      const deleteIdentity = vi.fn().mockResolvedValue(undefined);
      const initJockey = vi.fn();
      const apiGetJockey = vi.fn().mockResolvedValue(jockey());
      const promptText = vi.fn().mockResolvedValue('no');
      const con = captureConsole();

      let rc: number;
      try {
        rc = await initCommand(true, {
          loadIdentity, deleteIdentity, initJockey, apiGetJockey, promptText, isTTY: true,
        });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      expect(deleteIdentity).not.toHaveBeenCalled();
      expect(initJockey).not.toHaveBeenCalled();
      const out = con.logs.join('\n');
      expect(out).toContain('About to abandon jockey: Omar');
      expect(out).toContain('cancelled');
    });

    it('on a TTY: proceeds with delete and account creation when confirmed', async () => {
      let deleted = false;
      const loadIdentity = vi.fn().mockImplementation(async () => (deleted ? null : identity({ display_name: 'Omar' })));
      const deleteIdentity = vi.fn().mockImplementation(async () => { deleted = true; });
      const initJockey = vi.fn().mockResolvedValue({ user_id: 'u2', display_name: 'Fresh', secret_token: 't2' });
      const saveIdentity = vi.fn().mockResolvedValue(undefined);
      const apiGetJockey = vi.fn().mockResolvedValue(jockey());
      const promptText = vi.fn()
        .mockResolvedValueOnce('yes') // reset confirmation
        .mockResolvedValueOnce('Fresh'); // new jockey name prompt
      const con = captureConsole();

      let rc: number;
      try {
        rc = await initCommand(true, {
          loadIdentity, deleteIdentity, initJockey, saveIdentity, apiGetJockey, promptText, isTTY: true,
        });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      expect(deleteIdentity).toHaveBeenCalledTimes(1);
      expect(initJockey).toHaveBeenCalledWith({ display_name: 'Fresh' });
    });

    it('with no TTY: refuses, exits non-zero, and deletes nothing', async () => {
      const loadIdentity = vi.fn().mockResolvedValue(identity({ display_name: 'Omar' }));
      const deleteIdentity = vi.fn().mockResolvedValue(undefined);
      const initJockey = vi.fn();
      const apiGetJockey = vi.fn().mockResolvedValue(jockey());
      const promptText = vi.fn();
      const con = captureConsole();

      let rc: number;
      try {
        rc = await initCommand(true, {
          loadIdentity, deleteIdentity, initJockey, apiGetJockey, promptText, isTTY: false,
        });
      } finally {
        con.restore();
      }

      expect(rc).not.toBe(0);
      expect(deleteIdentity).not.toHaveBeenCalled();
      expect(initJockey).not.toHaveBeenCalled();
      expect(promptText).not.toHaveBeenCalled();
      expect(con.errors.join('\n')).toMatch(/refus/i);
    });

    it('mentions the device credential when getJockey reports a device_label', async () => {
      const loadIdentity = vi.fn().mockResolvedValue(identity({ display_name: 'Omar' }));
      const deleteIdentity = vi.fn().mockResolvedValue(undefined);
      const apiGetJockey = vi.fn().mockResolvedValue(jockey({ device_label: 'omars-laptop' }));
      const promptText = vi.fn().mockResolvedValue('no');
      const con = captureConsole();

      let rc: number;
      try {
        rc = await initCommand(true, {
          loadIdentity, deleteIdentity, apiGetJockey, promptText, isTTY: true,
        });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      expect(deleteIdentity).not.toHaveBeenCalled();
      const out = con.logs.join('\n');
      expect(out).toContain('omars-laptop');
      expect(out).toMatch(/Account view.*org manager|org manager.*Account view/);
    });

    it('mentions login as recovery when getJockey reports an email', async () => {
      const loadIdentity = vi.fn().mockResolvedValue(identity({ display_name: 'Omar' }));
      const deleteIdentity = vi.fn().mockResolvedValue(undefined);
      const apiGetJockey = vi.fn().mockResolvedValue(jockey({ email: 'omar@stackone.com' }));
      const promptText = vi.fn().mockResolvedValue('no');
      const con = captureConsole();

      let rc: number;
      try {
        rc = await initCommand(true, {
          loadIdentity, deleteIdentity, apiGetJockey, promptText, isTTY: true,
        });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      expect(deleteIdentity).not.toHaveBeenCalled();
      const out = con.logs.join('\n');
      expect(out).toContain('Google account linked');
      expect(out).toMatch(/would recover\s+this same jockey/);
    });

    it('still works when getJockey throws — the warning degrades but the command remains usable', async () => {
      let deleted = false;
      const loadIdentity = vi.fn().mockImplementation(async () => (deleted ? null : identity({ display_name: 'Omar' })));
      const deleteIdentity = vi.fn().mockImplementation(async () => { deleted = true; });
      const initJockey = vi.fn().mockResolvedValue({ user_id: 'u2', display_name: 'Fresh', secret_token: 't2' });
      const saveIdentity = vi.fn().mockResolvedValue(undefined);
      const apiGetJockey = vi.fn().mockRejectedValue(new ApiError('UNAUTHENTICATED', 'no credential', 401));
      const promptText = vi.fn()
        .mockResolvedValueOnce('yes')
        .mockResolvedValueOnce('Fresh');
      const con = captureConsole();

      let rc: number;
      try {
        rc = await initCommand(true, {
          loadIdentity, deleteIdentity, initJockey, saveIdentity, apiGetJockey, promptText, isTTY: true,
        });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      expect(deleteIdentity).toHaveBeenCalledTimes(1);
      expect(initJockey).toHaveBeenCalledWith({ display_name: 'Fresh' });
      expect(con.logs.join('\n')).toContain('About to abandon jockey: Omar');
    });

    it('still works with no existing local identity: no warning, no confirmation needed', async () => {
      const loadIdentity = vi.fn().mockResolvedValue(null);
      const deleteIdentity = vi.fn().mockResolvedValue(undefined);
      const initJockey = vi.fn().mockResolvedValue({ user_id: 'u2', display_name: 'Fresh', secret_token: 't2' });
      const saveIdentity = vi.fn().mockResolvedValue(undefined);
      const apiGetJockey = vi.fn();
      const promptText = vi.fn().mockResolvedValue('Fresh');
      const con = captureConsole();

      let rc: number;
      try {
        rc = await initCommand(true, {
          loadIdentity, deleteIdentity, initJockey, saveIdentity, apiGetJockey, promptText, isTTY: false,
        });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      expect(deleteIdentity).toHaveBeenCalledTimes(1);
      expect(apiGetJockey).not.toHaveBeenCalled();
      expect(initJockey).toHaveBeenCalledWith({ display_name: 'Fresh' });
    });
  });
});
