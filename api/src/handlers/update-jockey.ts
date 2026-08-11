import type { ApiHandler } from '../lib/http.js';
import type { UpdateJockeyRequest, UpdateJockeyResponse } from '@token-derby/shared';
import { USER_NAME_MAX_LENGTH } from '@token-derby/shared';
import { authenticate } from '../lib/auth.js';
import { updateUserDisplayName } from '../db/users.js';
import { ok, err, parseJson } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const body = parseJson<UpdateJockeyRequest>(event.body);
  if (!body || typeof body.display_name !== 'string') {
    return err('BAD_REQUEST', 'display_name is required');
  }
  const display_name = body.display_name.trim();
  if (display_name.length < 1 || display_name.length > USER_NAME_MAX_LENGTH) {
    return err('BAD_REQUEST', `display_name must be 1–${USER_NAME_MAX_LENGTH} characters`);
  }

  await updateUserDisplayName(auth.user_id, display_name);
  const response: UpdateJockeyResponse = { user_id: auth.user_id, display_name };
  return ok(response);
};
