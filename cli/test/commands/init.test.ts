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

function okFile(overrides: Partial<Identity> = {}) {
  return { kind: 'ok' as const, identity: identity(overrides) };
}

const missingFile = { kind: 'missing' as const };

function unreadableFile(reason = 'is not valid JSON') {
  return { kind: 'unreadable' as const, reason };
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
          loadIdentity, readIdentityFile: vi.fn().mockResolvedValue(okFile({ display_name: 'Omar' })),
          deleteIdentity, initJockey, apiGetJockey, promptText, isTTY: true,
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
          loadIdentity, readIdentityFile: vi.fn().mockResolvedValue(okFile({ display_name: 'Omar' })),
          deleteIdentity, initJockey, saveIdentity, apiGetJockey, promptText, isTTY: true,
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
          loadIdentity, readIdentityFile: vi.fn().mockResolvedValue(okFile({ display_name: 'Omar' })),
          deleteIdentity, initJockey, apiGetJockey, promptText, isTTY: false,
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
          loadIdentity, readIdentityFile: vi.fn().mockResolvedValue(okFile({ display_name: 'Omar' })),
          deleteIdentity, apiGetJockey, promptText, isTTY: true,
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
          loadIdentity, readIdentityFile: vi.fn().mockResolvedValue(okFile({ display_name: 'Omar' })),
          deleteIdentity, apiGetJockey, promptText, isTTY: true,
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
          loadIdentity, readIdentityFile: vi.fn().mockResolvedValue(okFile({ display_name: 'Omar' })),
          deleteIdentity, initJockey, saveIdentity, apiGetJockey, promptText, isTTY: true,
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
          loadIdentity, readIdentityFile: vi.fn().mockResolvedValue(missingFile),
          deleteIdentity, initJockey, saveIdentity, apiGetJockey, promptText, isTTY: false,
        });
      } finally {
        con.restore();
      }

      expect(rc).toBe(0);
      expect(deleteIdentity).toHaveBeenCalledTimes(1);
      expect(apiGetJockey).not.toHaveBeenCalled();
      expect(initJockey).toHaveBeenCalledWith({ display_name: 'Fresh' });
    });

    // The file existing and the file parsing are different questions, and the
    // guard has to key on the first: loadIdentity returns null for a
    // hand-edited file, an older shape, and an EACCES read alike.
    describe('an identity.json that cannot be parsed', () => {
      it('still warns, and says the credential itself cannot be read', async () => {
        const loadIdentity = vi.fn().mockResolvedValue(null);
        const deleteIdentity = vi.fn().mockResolvedValue(undefined);
        const initJockey = vi.fn();
        const promptText = vi.fn().mockResolvedValue('no');
        const con = captureConsole();

        let rc: number;
        try {
          rc = await initCommand(true, {
            loadIdentity, readIdentityFile: vi.fn().mockResolvedValue(unreadableFile('is not valid JSON')),
            deleteIdentity, initJockey, promptText, isTTY: true,
          });
        } finally {
          con.restore();
        }

        expect(rc).toBe(0);
        expect(deleteIdentity).not.toHaveBeenCalled();
        const out = con.logs.join('\n');
        expect(out).toContain('is not valid JSON');
        expect(out).toMatch(/cannot be read/i);
        expect(out).toContain('Reset cancelled. Nothing was deleted.');
      });

      it('refuses without a TTY, exactly as it does for a readable one', async () => {
        const loadIdentity = vi.fn().mockResolvedValue(null);
        const deleteIdentity = vi.fn().mockResolvedValue(undefined);
        const initJockey = vi.fn();
        const promptText = vi.fn();
        const con = captureConsole();

        let rc: number;
        try {
          rc = await initCommand(true, {
            loadIdentity, readIdentityFile: vi.fn().mockResolvedValue(unreadableFile('could not be read (EACCES)')),
            deleteIdentity, initJockey, promptText, isTTY: false,
          });
        } finally {
          con.restore();
        }

        expect(rc).not.toBe(0);
        expect(deleteIdentity).not.toHaveBeenCalled();
        expect(promptText).not.toHaveBeenCalled();
        expect(con.errors.join('\n')).toMatch(/refus/i);
      });

      it('deletes only after an explicit yes', async () => {
        const loadIdentity = vi.fn().mockResolvedValue(null);
        const deleteIdentity = vi.fn().mockResolvedValue(undefined);
        const initJockey = vi.fn().mockResolvedValue({ user_id: 'u2', display_name: 'Fresh', secret_token: 't2' });
        const saveIdentity = vi.fn().mockResolvedValue(undefined);
        const apiGetJockey = vi.fn();
        const promptText = vi.fn()
          .mockResolvedValueOnce('yes')
          .mockResolvedValueOnce('Fresh');
        const con = captureConsole();

        let rc: number;
        try {
          rc = await initCommand(true, {
            loadIdentity, readIdentityFile: vi.fn().mockResolvedValue(unreadableFile()),
            deleteIdentity, initJockey, saveIdentity, apiGetJockey, promptText, isTTY: true,
          });
        } finally {
          con.restore();
        }

        expect(rc).toBe(0);
        expect(deleteIdentity).toHaveBeenCalledTimes(1);
        // No credential to authenticate with, so the server-side warning is
        // skipped rather than attempted and swallowed.
        expect(apiGetJockey).not.toHaveBeenCalled();
        expect(initJockey).toHaveBeenCalledWith({ display_name: 'Fresh' });
      });
    });
  });
});

describe('plain init and an unreadable identity file', () => {
  it('refuses rather than overwriting a credential it cannot read', async () => {
    const saveIdentity = vi.fn();
    const deleteIdentity = vi.fn();
    const con = captureConsole();
    let rc: number;
    try {
      rc = await initCommand(false, {
        readIdentityFile: async () => ({ kind: 'unreadable', reason: 'is not valid JSON' }),
        loadIdentity: async () => null,
        saveIdentity, deleteIdentity,
        promptText: vi.fn(),
      } as any);
    } finally { con.restore(); }

    expect(rc).toBe(1);
    // State, not just the message: the whole point is that nothing was written.
    expect(saveIdentity).not.toHaveBeenCalled();
    expect(deleteIdentity).not.toHaveBeenCalled();
    expect(con.errors.join('\n')).toContain('will not overwrite it');
  });
});
