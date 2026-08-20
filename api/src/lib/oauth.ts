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

/** Public origin of the site. SITE_ORIGIN wins because CloudFront rewrites the
 *  viewer Host to the API Gateway domain; the Host fallback is for the local
 *  harness, which has no such proxy. */
export function originOf(event: APIGatewayProxyEventV2): string {
  const configured = process.env.SITE_ORIGIN?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const host = String(event.headers?.host ?? event.requestContext?.domainName ?? '');
  const scheme = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${scheme}://${host}`;
}

export const STATE_COOKIE_NAME = 'td_auth_state';

/** Binds the flow to the browser that started it: the signature proves we
 *  issued the state, this proves the callback is the same user agent. */
export function stateCookie(state: string): string {
  return `${STATE_COOKIE_NAME}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=${AUTH_REQUEST_TTL_SECONDS}`;
}

/** API Gateway v2 delivers cookies in `event.cookies`; the local harness passes
 *  the raw header. Read both, and never assume ours is first. */
export function readStateCookie(event: APIGatewayProxyEventV2): string | null {
  const raw = Array.isArray(event.cookies) && event.cookies.length > 0
    ? event.cookies
    : String(event.headers?.cookie ?? '').split(';');
  const prefix = `${STATE_COOKIE_NAME}=`;
  for (const entry of raw) {
    const pair = String(entry).trim();
    if (pair.startsWith(prefix)) return pair.slice(prefix.length);
  }
  return null;
}

export function stateCookieMatches(cookie: string | null, state: string): boolean {
  if (!cookie) return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(state);
  return a.length === b.length && timingSafeEqual(a, b);
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
