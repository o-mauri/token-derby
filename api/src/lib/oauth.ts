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

export const STATE_COOKIE_PREFIX = 'td_auth_state_';
const STATE_COOKIE_VALUE = '1';

/** Sixty seconds past AUTH_REQUEST_TTL_SECONDS: the cookie is checked before the
 *  pending row, so an equal lifetime turns a genuine timeout into sso_failed. */
export const STATE_COOKIE_TTL_SECONDS = AUTH_REQUEST_TTL_SECONDS + 60;

/** One cookie per flow. A fixed name would make a second tab's /start replace
 *  the first tab's cookie, leaving only the newest tab able to finish. */
export const stateCookieName = (state: string): string => `${STATE_COOKIE_PREFIX}${state}`;

/** Binds the flow to the browser that started it: the signature proves we
 *  issued the state, this proves the callback is the same user agent.
 *  `Path=/api/auth` rather than the `__Host-` prefix, which forbids Domain and
 *  forces Path=/: a deliberate trade of related-domain isolation for scoping,
 *  with the single-use AUTHREQ# row still bounding the damage. */
export function stateCookie(state: string): string {
  return `${stateCookieName(state)}=${STATE_COOKIE_VALUE}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=${STATE_COOKIE_TTL_SECONDS}`;
}

/** API Gateway v2 delivers cookies in `event.cookies`, one `name=value` per
 *  entry; the local harness mirrors that. Order is never ours to assume. */
function cookiePairs(event: APIGatewayProxyEventV2): string[] {
  const raw = Array.isArray(event.cookies) ? event.cookies : [];
  return raw.map((entry) => String(entry).trim());
}

/** True only when the browser presents the cookie THIS flow's /start set. The
 *  state is already HMAC-verified and travels in the callback URL, so there is
 *  no secret here to leak through a plain comparison. */
export function hasStateCookie(event: APIGatewayProxyEventV2, state: string): boolean {
  if (!state) return false;
  const expected = `${stateCookieName(state)}=${STATE_COOKIE_VALUE}`;
  return cookiePairs(event).includes(expected);
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
