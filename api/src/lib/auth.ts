import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { timingSafeEqual } from 'node:crypto';
import { USER_ID_HEADER, USER_TOKEN_HEADER } from '@token-derby/shared';
import { getUserById } from '../db/users.js';
import { getDeviceByToken, touchDevice } from '../db/devices.js';
import { bearerToken } from './admin-auth.js';
import { getWebSession } from '../db/web-sessions.js';
import { hashSecretToken } from './token-hash.js';

export type AuthenticatedCaller = { user_id: string; display_name: string; device_label?: string };
export type AuthError = { error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bounds device 'last seen' writes to one per interval per device. Generous
// because the column is a disambiguator, not a liveness signal — see the touch
// site in authenticate below.
export const DEVICE_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

// Re-exported so existing call sites (init-jockey handler, tests) keep working unchanged.
export { hashSecretToken };

export async function authenticate(
  event: APIGatewayProxyEventV2,
): Promise<AuthenticatedCaller | AuthError> {
  const headers = event.headers ?? {};
  let rawId: string | undefined;
  let rawToken: string | undefined;
  for (const k of Object.keys(headers)) {
    const lower = k.toLowerCase();
    if (lower === USER_ID_HEADER) {
      const v = headers[k];
      if (typeof v === 'string') rawId = v.trim();
    } else if (lower === USER_TOKEN_HEADER) {
      const v = headers[k];
      if (typeof v === 'string') rawToken = v.trim();
    }
  }

  if (!rawId || !rawToken) {
    return { error: 'X-User-Id and X-User-Token headers required' };
  }
  if (!UUID_RE.test(rawId)) {
    return { error: 'X-User-Id must be a UUID' };
  }

  const user = await getUserById(rawId);
  if (!user) {
    return { error: 'Unknown user — run `token-derby login` to create one' };
  }

  const providedHash = hashSecretToken(rawToken);
  const storedHash = user.secret_token_hash;
  const hasLegacyHash = typeof storedHash === 'string' && storedHash.length > 0;
  // Legacy users match here in one read, checked first so the common path costs
  // one read rather than two. That path is the interactive CLI commands — join,
  // stable, roll — and the org endpoints, several of which fire on a single
  // org-manager page render. It is NOT the race heartbeat: heartbeat.ts
  // authenticates per-horse via getHorseForHeartbeat and never calls this.
  if (hasLegacyHash && providedHash.length === storedHash.length) {
    const a = Buffer.from(providedHash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (timingSafeEqual(a, b)) {
      return { user_id: user.user_id, display_name: user.display_name };
    }
  }

  // No hash (SSO-created user) or the hash didn't match: fall back to a
  // per-device credential. This is the only path that pays a second read.
  const device = await getDeviceByToken(user.user_id, rawToken);
  if (!device) {
    return { error: 'Invalid token' };
  }

  // Refresh last_seen_at, throttled so that authenticating is not also a write
  // on every one of those calls. It means "last used to reach the API" — enough
  // to tell two same-labelled devices apart in the account view, and not a
  // liveness signal: a machine mid-race authenticates nothing, so its row can
  // read hours stale while that machine is the busiest one there is.
  if (Date.now() - Date.parse(device.last_seen_at) > DEVICE_TOUCH_INTERVAL_MS) {
    await touchDevice(user.user_id, rawToken);
  }

  return { user_id: user.user_id, display_name: user.display_name, device_label: device.label };
}

export type ResolvedCaller = AuthenticatedCaller & { source: 'cli' | 'web' };

/**
 * Resolves the caller from EITHER CLI identity headers (X-User-Id/X-User-Token)
 * or an Authorization: Bearer <web-session> token. The `source` lets handlers
 * apply the CLI-only version gate to CLI callers only.
 */
export async function resolveCaller(
  event: APIGatewayProxyEventV2,
): Promise<ResolvedCaller | AuthError> {
  const token = bearerToken(event);
  if (token) {
    const session = await getWebSession(token);
    if (!session) return { error: 'Invalid or expired web session' };
    return { user_id: session.user_id, display_name: session.display_name, source: 'web' };
  }
  const cli = await authenticate(event);
  if ('error' in cli) return cli;
  return { ...cli, source: 'cli' };
}
