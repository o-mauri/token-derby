import { describe, it, expect } from 'vitest';
import {
  putWebGrant, consumeWebGrant, putWebSession, getWebSession, deleteWebSession,
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
});
