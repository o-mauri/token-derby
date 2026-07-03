import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { bearerToken } from '../lib/admin-auth.js';
import { deleteWebSession } from '../db/web-sessions.js';
import { ok } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const token = bearerToken(event);
  // Idempotent logout: deleting a missing/absent session is a no-op.
  if (token) await deleteWebSession(token);
  return ok({ deleted: true });
};
