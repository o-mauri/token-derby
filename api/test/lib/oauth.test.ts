import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { generatePkce, signState, verifyState, buildAuthorizeUrl } from '../../src/lib/oauth.js';

describe('generatePkce', () => {
  it('produces a 43-char base64url verifier and its S256 challenge', () => {
    const { verifier, challenge } = generatePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
  it('is different every call', () => {
    expect(generatePkce().verifier).not.toBe(generatePkce().verifier);
  });
});

describe('state signing', () => {
  it('round-trips', () => {
    const signed = signState('secret', 'abc123');
    expect(verifyState('secret', signed)).toBe('abc123');
  });
  it('rejects a tampered state', () => {
    const signed = signState('secret', 'abc123');
    expect(verifyState('secret', signed.replace('abc123', 'abc124'))).toBeNull();
  });
  it('rejects a wrong secret', () => {
    expect(verifyState('other', signState('secret', 'abc123'))).toBeNull();
  });
  it('rejects malformed input', () => {
    expect(verifyState('secret', 'no-dot')).toBeNull();
    expect(verifyState('secret', '')).toBeNull();
  });
});

describe('buildAuthorizeUrl', () => {
  it('includes every parameter Google needs', () => {
    const url = new URL(buildAuthorizeUrl({
      clientId: 'cid', redirectUri: 'https://example.com/api/auth/google/callback',
      state: 'st', nonce: 'no', challenge: 'ch',
    }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/api/auth/google/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('nonce')).toBe('no');
    expect(url.searchParams.get('code_challenge')).toBe('ch');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});
