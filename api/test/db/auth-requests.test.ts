import { describe, it, expect } from 'vitest';
import { putAuthRequest, consumeAuthRequest } from '../../src/db/auth-requests.js';
import { randomUUID } from 'node:crypto';

const base = (state: string) => ({
  state, code_verifier: 'verifier-'.padEnd(50, 'x'), nonce: 'nonce-1',
  redirect_uri: 'https://token-derby.mauricode.co.uk/api/auth/google/callback',
  ttlSeconds: 600,
});

describe('auth requests', () => {
  it('round-trips the verifier, nonce and redirect_uri', async () => {
    const state = randomUUID();
    await putAuthRequest(base(state));
    const got = await consumeAuthRequest(state);
    expect(got).not.toBeNull();
    expect(got!.code_verifier).toBe(base(state).code_verifier);
    expect(got!.nonce).toBe('nonce-1');
    expect(got!.redirect_uri).toContain('/api/auth/google/callback');
    expect(got!.link_to_user_id).toBeUndefined();
  });

  it('carries a link target when one was set', async () => {
    const state = randomUUID();
    await putAuthRequest({ ...base(state), link_to_user_id: 'user-42' });
    const got = await consumeAuthRequest(state);
    expect(got!.link_to_user_id).toBe('user-42');
  });

  it('is single-use — a replayed callback gets nothing', async () => {
    const state = randomUUID();
    await putAuthRequest(base(state));
    expect(await consumeAuthRequest(state)).not.toBeNull();
    expect(await consumeAuthRequest(state)).toBeNull();
  });

  it('returns null for an unknown state', async () => {
    expect(await consumeAuthRequest(randomUUID())).toBeNull();
  });

  it('treats an expired row as absent even before TTL deletion runs', async () => {
    const state = randomUUID();
    await putAuthRequest({ ...base(state), ttlSeconds: -1 });
    expect(await consumeAuthRequest(state)).toBeNull();
  });
});
