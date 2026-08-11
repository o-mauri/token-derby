import type { ApiHandler } from '../lib/http.js';
import type { WebSessionCreateResponse } from '@token-derby/shared';
import { authenticate } from '../lib/auth.js';
import { putWebGrant } from '../db/web-sessions.js';
import { generateWebSessionCode } from '../lib/codes.js';
import { ok, err } from '../lib/http.js';

const GRANT_TTL_SECONDS = 60;

export const handler: ApiHandler = async (event) => {
  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const code = generateWebSessionCode();
  await putWebGrant(code, auth.user_id, auth.display_name, GRANT_TTL_SECONDS);

  const response: WebSessionCreateResponse = { code };
  return ok(response);
};
