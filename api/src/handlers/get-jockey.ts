import type { ApiHandler } from '../lib/http.js';
import type { GetJockeyResponse } from '@token-derby/shared';
import { authenticate } from '../lib/auth.js';
import { getUserById } from '../db/users.js';
import { ok, err } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const user = await getUserById(auth.user_id);
  if (!user) return err('UNAUTHENTICATED', 'User not found');

  const response: GetJockeyResponse = {
    user_id: user.user_id,
    display_name: user.display_name,
    created_at: user.created_at,
  };
  return ok(response);
};
