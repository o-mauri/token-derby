import type { ApiHandler } from '../lib/http.js';
import type { LogoutDeviceResponse } from '@token-derby/shared';
import { authenticate } from '../lib/auth.js';
import { deleteDeviceByToken } from '../db/devices.js';
import { ok, err } from '../lib/http.js';
import { USER_TOKEN_HEADER } from '@token-derby/shared';

/**
 * Deletes whichever device row authenticated this request — the CLI has no
 * way to compute its own device_id from the token it holds (device_id is a
 * random UUID, unrelated to the token hash that forms the sort key), so the
 * server resolves it here instead of making the client guess.
 *
 * CLI-only: web sessions carry no device credential to revoke, so this uses
 * `authenticate` (CLI headers) rather than `resolveCaller`.
 */
export const handler: ApiHandler = async (event) => {
  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  // authenticate() already validated this header exists; re-read it here
  // since it doesn't return the raw token it matched against.
  const headers = event.headers ?? {};
  let rawToken: string | undefined;
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === USER_TOKEN_HEADER) {
      const v = headers[k];
      if (typeof v === 'string') rawToken = v.trim();
    }
  }
  const revoked = rawToken ? await deleteDeviceByToken(auth.user_id, rawToken) : false;

  const response: LogoutDeviceResponse = { revoked };
  return ok(response);
};
