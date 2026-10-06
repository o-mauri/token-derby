import type { ApiHandler } from '../lib/http.js';
import type { WebSessionsDeleteAllResponse } from '@token-derby/shared';
import { resolveCaller } from '../lib/auth.js';
import { deleteUserWebSessions } from '../db/web-sessions.js';
import { ok, err } from '../lib/http.js';

// Signs the caller out of every browser, the calling one included; CLI devices are untouched.
export const handler: ApiHandler = async (event) => {
  const auth = await resolveCaller(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);
  const response: WebSessionsDeleteAllResponse = { signed_out: await deleteUserWebSessions(auth.user_id) };
  return ok(response);
};
