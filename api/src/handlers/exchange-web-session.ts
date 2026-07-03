import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { WebSessionExchangeRequest, WebSessionExchangeResponse } from '@token-derby/shared';
import { consumeWebGrant, putWebSession } from '../db/web-sessions.js';
import { generateWebSessionToken } from '../lib/codes.js';
import { ok, err, parseJson } from '../lib/http.js';

const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const body = parseJson<WebSessionExchangeRequest>(event.body);
  if (!body || typeof body.code !== 'string' || !body.code) {
    return err('BAD_REQUEST', 'code is required');
  }

  const grant = await consumeWebGrant(body.code);
  if (!grant) return err('UNAUTHENTICATED', 'Login link is invalid or has expired');

  const token = generateWebSessionToken();
  const expires_at = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await putWebSession(token, grant.user_id, grant.display_name, expires_at, SESSION_TTL_SECONDS);

  const response: WebSessionExchangeResponse = {
    token,
    expires_at,
    user: { user_id: grant.user_id, display_name: grant.display_name },
  };
  return ok(response);
};
