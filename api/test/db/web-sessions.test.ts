import { describe, it, expect } from 'vitest';
import {
  putWebGrant, consumeWebGrant, putWebSession, getWebSession, deleteWebSession,
  deleteUserWebSessions, setUserWebSessionsDisplayName,
} from '../../src/db/web-sessions.js';
import { generateWebSessionCode, generateWebSessionToken } from '../../src/lib/codes.js';

describe('web-session db layer', () => {
  it('stores and single-use-consumes a grant', async () => {
    const code = generateWebSessionCode();
    await putWebGrant(code, 'u1', 'Alice', 60);
    const first = await consumeWebGrant(code);
    expect(first).toEqual({ user_id: 'u1', display_name: 'Alice' });
    const second = await consumeWebGrant(code);
    expect(second).toBeNull();
  });

  it('returns null consuming an unknown grant', async () => {
    expect(await consumeWebGrant('nope-code')).toBeNull();
  });

  it('treats an expired grant as absent', async () => {
    const code = generateWebSessionCode();
    await putWebGrant(code, 'u1', 'Alice', -10); // already expired
    expect(await consumeWebGrant(code)).toBeNull();
  });

  it('stores, reads, and deletes a session', async () => {
    const token = generateWebSessionToken();
    const exp = new Date(Date.now() + 3600_000).toISOString();
    await putWebSession(token, 'u2', 'Bob', exp, 3600);
    const got = await getWebSession(token);
    expect(got).toEqual({ user_id: 'u2', display_name: 'Bob', expires_at: exp });
    await deleteWebSession(token);
    expect(await getWebSession(token)).toBeNull();
  });

  it('treats an expired session as absent', async () => {
    const token = generateWebSessionToken();
    const exp = new Date(Date.now() - 10_000).toISOString();
    await putWebSession(token, 'u2', 'Bob', exp, -10);
    expect(await getWebSession(token)).toBeNull();
  });

  describe('per user', () => {
    const later = () => new Date(Date.now() + 3600_000).toISOString();
    const uid = () => `u-ws-${Math.random().toString(36).slice(2)}`;

    it('signs out every session of one user and leaves others alone', async () => {
      const [me, other] = [uid(), uid()];
      const [a, b, c] = [generateWebSessionToken(), generateWebSessionToken(), generateWebSessionToken()];
      await putWebSession(a, me, 'Me', later(), 3600);
      await putWebSession(b, me, 'Me', later(), 3600);
      await putWebSession(c, other, 'Other', later(), 3600);
      expect(await deleteUserWebSessions(me)).toBe(2);
      expect(await getWebSession(a)).toBeNull();
      expect(await getWebSession(b)).toBeNull();
      expect(await getWebSession(c)).not.toBeNull();
    });

    it('forgets a session signed out on its own', async () => {
      const me = uid();
      const [a, b] = [generateWebSessionToken(), generateWebSessionToken()];
      await putWebSession(a, me, 'Me', later(), 3600);
      await putWebSession(b, me, 'Me', later(), 3600);
      await deleteWebSession(a);
      expect(await deleteUserWebSessions(me)).toBe(1);
    });

    it('renames every session of one user', async () => {
      const [me, other] = [uid(), uid()];
      const [a, b, c] = [generateWebSessionToken(), generateWebSessionToken(), generateWebSessionToken()];
      await putWebSession(a, me, 'Old', later(), 3600);
      await putWebSession(b, me, 'Old', later(), 3600);
      await putWebSession(c, other, 'Other', later(), 3600);
      await setUserWebSessionsDisplayName(me, 'New');
      expect((await getWebSession(a))!.display_name).toBe('New');
      expect((await getWebSession(b))!.display_name).toBe('New');
      expect((await getWebSession(c))!.display_name).toBe('Other');
    });
  });
});
