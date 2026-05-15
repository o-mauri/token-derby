import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createHash, timingSafeEqual } from 'node:crypto';
import { USER_ID_HEADER, USER_TOKEN_HEADER } from '@token-derby/shared';
import { getUserById } from '../db/users.js';

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
