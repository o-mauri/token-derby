import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createHash, timingSafeEqual } from 'node:crypto';
import { USER_ID_HEADER, USER_TOKEN_HEADER } from '@token-derby/shared';
import { getUserById } from '../db/users.js';
import { bearerToken } from './admin-auth.js';
import { getWebSession } from '../db/web-sessions.js';

export type AuthenticatedCaller = { user_id: string; display_name: string };
export type AuthError = { error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hashSecretToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

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
    return { error: 'Unknown user — run `token-derby init` to create one' };
  }

  const providedHash = hashSecretToken(rawToken);
  const storedHash = user.secret_token_hash;
  // SSO-created users have no CLI credential at all. Without this guard the
  // length comparison below throws and the caller sees a 500 instead of a 401.
  if (typeof storedHash !== 'string' || storedHash.length === 0) {
    return { error: 'This account has no CLI token — run `token-derby login`' };
  }
  if (providedHash.length !== storedHash.length) {
    return { error: 'Invalid token' };
  }
  const a = Buffer.from(providedHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (!timingSafeEqual(a, b)) {
    return { error: 'Invalid token' };
  }

  return { user_id: user.user_id, display_name: user.display_name };
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
