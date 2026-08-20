import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export const AUTH_REQUEST_TTL_SECONDS = 600;
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = 'openid email profile';

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url'); // 43 chars
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// The pending-request row is the real CSRF defence; this signature is a cheap
// pre-filter so junk callbacks are rejected without a table read.
export function signState(secret: string, state: string): string {
  const mac = createHmac('sha256', secret).update(state).digest('base64url');
  return `${state}.${mac}`;
}

export function verifyState(secret: string, signed: string): string | null {
  const idx = signed.lastIndexOf('.');
  if (idx <= 0 || idx === signed.length - 1) return null;
  const state = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = createHmac('sha256', secret).update(state).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return state;
}

/** Origin the request arrived on, so prod and the local harness both work
 *  without configuration. */
export function originOf(event: APIGatewayProxyEventV2): string {
  const host = String(event.headers?.host ?? event.requestContext?.domainName ?? '');
  const scheme = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${scheme}://${host}`;
}

export function buildAuthorizeUrl(o: {
  clientId: string; redirectUri: string; state: string; nonce: string; challenge: string;
}): string {
  const p = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state: o.state,
    nonce: o.nonce,
    code_challenge: o.challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${p.toString()}`;
}
