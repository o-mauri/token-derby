import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { AdminLoginRequest, AdminLoginResponse } from '@token-derby/shared';
import { verifyPassword, signSession } from '../lib/admin-auth.js';
import { loadAdminConfig } from '../lib/admin-config.js';
import { ok, err, parseJson } from '../lib/http.js';

const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const body = parseJson<AdminLoginRequest>(event.body);
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return err('BAD_REQUEST', 'username and password are required');
  }

  const cfg = await loadAdminConfig();
  const userMatches = body.username === cfg.username;
  const passwordMatches = verifyPassword(body.password, cfg.passwordHash);
  // Evaluate both before branching to keep the failure path constant-ish.
  if (!userMatches || !passwordMatches) {
    return err('UNAUTHENTICATED', 'Invalid username or password');
  }

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = signSession(cfg.sessionSecret, { sub: 'admin', exp });
  const response: AdminLoginResponse = {
    token,
    expires_at: new Date(exp * 1000).toISOString(),
  };
  return ok(response);
};
