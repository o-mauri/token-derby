import { createPublicKey, createVerify, timingSafeEqual } from 'node:crypto';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const CLOCK_SKEW_SECONDS = 60;

export type GoogleClaims = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  hd?: string;
  nonce?: string;
};

type Jwks = { keys: any[] };
type VerifyOpts = {
  clientId: string;
  nonce: string;
  fetchJwks?: () => Promise<Jwks>;
  now?: () => number;
};

let jwksCache: Jwks | null = null;

export function __resetJwksCacheForTests(): void {
  jwksCache = null;
}

async function defaultFetchJwks(): Promise<Jwks> {
  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  return (await res.json()) as Jwks;
}

function decodeSegment(seg: string): Record<string, any> {
  return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
}

export async function verifyGoogleIdToken(
  idToken: string,
  opts: VerifyOpts,
): Promise<GoogleClaims> {
  const now = opts.now ?? Date.now;
  const parts = idToken.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new Error('ID token is malformed');
  }
  const [headerSeg, payloadSeg, sigSeg] = parts as [string, string, string];

  let header: Record<string, any>;
  let payload: Record<string, any>;
  try {
    header = decodeSegment(headerSeg);
    payload = decodeSegment(payloadSeg);
  } catch {
    throw new Error('ID token is malformed');
  }

  // Pin the algorithm before touching the signature, so `alg: none` and
  // symmetric-key confusion attacks cannot get past this point.
  if (header.alg !== 'RS256') throw new Error(`Unsupported alg: ${header.alg}`);
  if (typeof header.kid !== 'string') throw new Error('ID token has no kid');

  if (!jwksCache || !jwksCache.keys.some((k) => k.kid === header.kid)) {
    jwksCache = await (opts.fetchJwks ?? defaultFetchJwks)();
  }
  const jwk = jwksCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`No JWKS key for kid ${header.kid}`);

  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const ok = createVerify('RSA-SHA256')
    .update(`${headerSeg}.${payloadSeg}`)
    .verify(key, Buffer.from(sigSeg, 'base64url'));
  if (!ok) throw new Error('ID token signature is invalid');

  if (typeof payload.iss !== 'string' || !VALID_ISSUERS.has(payload.iss)) {
    throw new Error(`Unexpected iss: ${payload.iss}`);
  }
  if (payload.aud !== opts.clientId) throw new Error('Unexpected aud');

  const nowSeconds = Math.floor(now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
    throw new Error('ID token has expired');
  }
  if (typeof payload.iat === 'number' && payload.iat > nowSeconds + CLOCK_SKEW_SECONDS) {
    throw new Error('ID token iat is in the future');
  }

  const expected = Buffer.from(opts.nonce);
  const actual = Buffer.from(String(payload.nonce ?? ''));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('ID token nonce does not match');
  }

  if (payload.email_verified !== true) {
    throw new Error('Google email is not verified');
  }
  if (typeof payload.email !== 'string' || payload.email === '') {
    throw new Error('ID token has no email');
  }
  if (typeof payload.sub !== 'string' || payload.sub === '') {
    throw new Error('ID token has no sub');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    email_verified: true,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    given_name: typeof payload.given_name === 'string' ? payload.given_name : undefined,
    hd: typeof payload.hd === 'string' ? payload.hd : undefined,
    nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined,
  };
}
