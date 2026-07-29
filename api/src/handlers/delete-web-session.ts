import type { ApiHandler } from '../lib/http.js';
import { bearerToken } from '../lib/admin-auth.js';
import { deleteWebSession } from '../db/web-sessions.js';
import { ok } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const token = bearerToken(event);
  // Idempotent logout: deleting a missing/absent session is a no-op.
  if (token) await deleteWebSession(token);
  return ok({ deleted: true });
};
