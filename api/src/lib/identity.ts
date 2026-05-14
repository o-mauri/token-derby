import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { USER_ID_HEADER, USER_NAME_HEADER, USER_NAME_MAX_LENGTH } from '@token-derby/shared';

export type CallerIdentity = { user_id: string; user_name: string };
export type IdentityError = { error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readIdentity(event: APIGatewayProxyEventV2): CallerIdentity | IdentityError {
  const headers = event.headers ?? {};
  let rawId: string | undefined;
  let rawName: string | undefined;
  for (const k of Object.keys(headers)) {
    const lower = k.toLowerCase();
    if (lower === USER_ID_HEADER) {
      const v = headers[k];
      if (typeof v === 'string') rawId = v.trim();
    } else if (lower === USER_NAME_HEADER) {
      const v = headers[k];
      if (typeof v === 'string') rawName = v.trim();
    }
  }

  if (!rawId || !rawName) {
    return { error: `X-User-Id and X-User-Name headers required` };
  }
  if (!UUID_RE.test(rawId)) {
    return { error: `X-User-Id must be a UUID` };
  }
  if (rawName.length < 1 || rawName.length > USER_NAME_MAX_LENGTH) {
    return { error: `X-User-Name must be 1–${USER_NAME_MAX_LENGTH} characters` };
  }

  return { user_id: rawId, user_name: rawName };
}
