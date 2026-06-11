import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export type SessionPayload = { sub: 'admin'; exp: number };

const SCRYPT_KEYLEN = 64;

/** Returns "saltHex:hashHex". */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const actual = scryptSync(plain, Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN);
  return timingSafeEqual(actual, expected);
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function hmac(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

export function signSession(secret: string, payload: SessionPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(hmac(secret, body));
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; payload: SessionPayload }
  | { ok: false; reason: string };

export function verifySession(secret: string, token: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'malformed' };
  }
  const [body, sig] = parts;
  const expectedSig = b64url(hmac(secret, body));
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad-signature' };
  }
  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'bad-payload' };
  }
  if (payload === null || typeof payload !== 'object' || (payload as any).sub !== 'admin' || typeof (payload as any).exp !== 'number') {
    return { ok: false, reason: 'bad-payload' };
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, payload };
}

export function bearerToken(event: APIGatewayProxyEventV2): string | null {
  const headers = event.headers ?? {};
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === 'authorization') {
      const v = headers[k];
      if (typeof v !== 'string') return null;
      const m = /^Bearer\s+(.+)$/i.exec(v.trim());
      return m ? m[1].trim() : null;
    }
  }
  return null;
}

export function requireAdmin(
  event: APIGatewayProxyEventV2,
  sessionSecret: string,
): VerifyResult {
  const token = bearerToken(event);
  if (!token) return { ok: false, reason: 'missing-token' };
  return verifySession(sessionSecret, token);
}
