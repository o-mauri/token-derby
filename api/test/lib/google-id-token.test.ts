import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { verifyGoogleIdToken, __resetJwksCacheForTests } from '../../src/lib/google-id-token.js';

const CLIENT_ID = 'client-id-123.apps.googleusercontent.com';
const KID = 'test-key-1';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
// publicKey is already a public KeyObject — createPublicKey(publicKey) throws
// on this Node version ("expected private"), so export it directly instead.
const jwk = { ...(publicKey.export({ format: 'jwk' }) as any), kid: KID, alg: 'RS256', use: 'sig' };
const fetchJwks = async () => ({ keys: [jwk] });

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

function signToken(payload: Record<string, unknown>, header: Record<string, unknown> = {}) {
  const h = b64({ alg: 'RS256', typ: 'JWT', kid: KID, ...header });
  const p = b64(payload);
  const sig = createSign('RSA-SHA256').update(`${h}.${p}`).sign(privateKey).toString('base64url');
  return `${h}.${p}.${sig}`;
}

const now = () => 1_700_000_000_000;
function goodPayload(over: Record<string, unknown> = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '1234567890',
    email: 'omar@stackone.com',
    email_verified: true,
    name: 'Omar Mauri',
    given_name: 'Omar',
    hd: 'stackone.com',
    nonce: 'the-nonce',
    iat: Math.floor(now() / 1000) - 10,
    exp: Math.floor(now() / 1000) + 3600,
    ...over,
  };
}
const opts = (over: Record<string, unknown> = {}) =>
  ({ clientId: CLIENT_ID, nonce: 'the-nonce', fetchJwks, now, ...over }) as any;

beforeEach(() => __resetJwksCacheForTests());

describe('verifyGoogleIdToken', () => {
  it('accepts a valid token and returns the claims', async () => {
    const claims = await verifyGoogleIdToken(signToken(goodPayload()), opts());
    expect(claims.sub).toBe('1234567890');
    expect(claims.email).toBe('omar@stackone.com');
    expect(claims.email_verified).toBe(true);
    expect(claims.given_name).toBe('Omar');
    expect(claims.hd).toBe('stackone.com');
  });

  it('accepts the bare accounts.google.com issuer too', async () => {
    const claims = await verifyGoogleIdToken(signToken(goodPayload({ iss: 'accounts.google.com' })), opts());
    expect(claims.email).toBe('omar@stackone.com');
  });

  it('rejects a wrong audience', async () => {
    await expect(verifyGoogleIdToken(signToken(goodPayload({ aud: 'someone-else' })), opts()))
      .rejects.toThrow(/aud/i);
  });

  it('rejects a wrong issuer', async () => {
    await expect(verifyGoogleIdToken(signToken(goodPayload({ iss: 'https://evil.example' })), opts()))
      .rejects.toThrow(/iss/i);
  });

  it('rejects an expired token', async () => {
    await expect(verifyGoogleIdToken(signToken(goodPayload({ exp: Math.floor(now() / 1000) - 1 })), opts()))
      .rejects.toThrow(/expired/i);
  });

  it('rejects a mismatched nonce', async () => {
    await expect(verifyGoogleIdToken(signToken(goodPayload({ nonce: 'other' })), opts()))
      .rejects.toThrow(/nonce/i);
  });

  it('rejects email_verified false — an unverified email must never establish identity', async () => {
    await expect(verifyGoogleIdToken(signToken(goodPayload({ email_verified: false })), opts()))
      .rejects.toThrow(/verified/i);
  });

  it('rejects a tampered signature', async () => {
    const tok = signToken(goodPayload());
    const parts = tok.split('.');
    const forged = `${parts[0]}.${b64({ ...goodPayload(), email: 'attacker@evil.example' })}.${parts[2]}`;
    await expect(verifyGoogleIdToken(forged, opts())).rejects.toThrow(/signature/i);
  });

  it('rejects an unknown kid', async () => {
    const tok = signToken(goodPayload(), { kid: 'not-a-real-kid' });
    await expect(verifyGoogleIdToken(tok, opts())).rejects.toThrow(/kid/i);
  });

  it('rejects a non-RS256 alg — no algorithm confusion', async () => {
    const h = b64({ alg: 'none', typ: 'JWT', kid: KID });
    const p = b64(goodPayload());
    await expect(verifyGoogleIdToken(`${h}.${p}.`, opts())).rejects.toThrow(/alg/i);
  });

  it('rejects a malformed token', async () => {
    await expect(verifyGoogleIdToken('not.a.jwt.at.all', opts())).rejects.toThrow(/malformed/i);
  });

  it('caches the JWKS across calls', async () => {
    let calls = 0;
    const counting = async () => { calls++; return { keys: [jwk] }; };
    await verifyGoogleIdToken(signToken(goodPayload()), opts({ fetchJwks: counting }));
    await verifyGoogleIdToken(signToken(goodPayload()), opts({ fetchJwks: counting }));
    expect(calls).toBe(1);
  });
});
