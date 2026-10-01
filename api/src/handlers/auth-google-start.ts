import { randomUUID } from 'node:crypto';
import type { ApiHandler } from '../lib/http.js';
import { loadAuthConfig } from '../lib/auth-config.js';
import { putAuthRequest } from '../db/auth-requests.js';
import {
  generatePkce, signState, buildAuthorizeUrl, originOf, stateCookie, AUTH_REQUEST_TTL_SECONDS,
} from '../lib/oauth.js';

export const handler: ApiHandler = async (event) => {
  const cfg = await loadAuthConfig();
  const state = randomUUID();
  const nonce = randomUUID();
  const { verifier, challenge } = generatePkce();
  const redirectUri = `${originOf(event)}/api/auth/google/callback`;

  await putAuthRequest({
    state, code_verifier: verifier, nonce, redirect_uri: redirectUri,
    ttlSeconds: AUTH_REQUEST_TTL_SECONDS,
  });

  return {
    statusCode: 302,
    headers: {
      location: buildAuthorizeUrl({
        clientId: cfg.clientId, redirectUri, state: signState(cfg.stateSecret, state), nonce, challenge,
      }),
      'cache-control': 'no-store',
    },
    cookies: [stateCookie(state)],
    body: '',
  };
};
