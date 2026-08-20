import { randomUUID } from 'node:crypto';
import type { ApiHandler } from '../lib/http.js';
import { ok, err } from '../lib/http.js';
import { bearerToken } from '../lib/admin-auth.js';
import { getWebSession } from '../db/web-sessions.js';
import { loadAuthConfig } from '../lib/auth-config.js';
import { putAuthRequest } from '../db/auth-requests.js';
import {
  generatePkce, signState, buildAuthorizeUrl, originOf, AUTH_REQUEST_TTL_SECONDS,
} from '../lib/oauth.js';

export const handler: ApiHandler = async (event) => {
  const token = bearerToken(event);
  if (!token) return err('UNAUTHENTICATED', 'Sign in first to link a Google account');
  const session = await getWebSession(token);
  if (!session) return err('UNAUTHENTICATED', 'Invalid or expired web session');

  const host = event.headers?.host ?? event.requestContext?.domainName;
  if (!host) return err('BAD_REQUEST', 'Host header required');

  const cfg = await loadAuthConfig();
  const state = randomUUID();
  const nonce = randomUUID();
  const { verifier, challenge } = generatePkce();
  const redirectUri = `${originOf(event)}/api/auth/google/callback`;

  // The link target rides on the stored request, never through the browser.
  await putAuthRequest({
    state, code_verifier: verifier, nonce, redirect_uri: redirectUri,
    link_to_user_id: session.user_id, ttlSeconds: AUTH_REQUEST_TTL_SECONDS,
  });

  return ok({
    authorize_url: buildAuthorizeUrl({
      clientId: cfg.clientId, redirectUri, state: signState(cfg.stateSecret, state), nonce, challenge,
    }),
  });
};
