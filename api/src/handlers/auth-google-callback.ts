import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { ApiHandler } from '../lib/http.js';
import { loadAuthConfig } from '../lib/auth-config.js';
import { consumeAuthRequest } from '../db/auth-requests.js';
import { verifyState, originOf } from '../lib/oauth.js';
import { verifyGoogleIdToken } from '../lib/google-id-token.js';
import { resolveGoogleIdentity, EmailAlreadyLinkedError } from '../lib/identity-link.js';
import { putWebGrant } from '../db/web-sessions.js';
import { generateWebSessionCode } from '../lib/codes.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GRANT_TTL_SECONDS = 60;
const CALLBACK_PATH = '/api/auth/google/callback';

export type CallbackDeps = {
  fetchImpl?: typeof fetch;
  verifyIdToken?: typeof verifyGoogleIdToken;
};

function siteOriginFrom(redirectUri: string): string {
  return redirectUri.endsWith(CALLBACK_PATH)
    ? redirectUri.slice(0, -CALLBACK_PATH.length)
    : new URL(redirectUri).origin;
}

function redirect(location: string): APIGatewayProxyStructuredResultV2 {
  return { statusCode: 302, headers: { location, 'cache-control': 'no-store' }, body: '' };
}

const fail = (origin: string, code: string) =>
  redirect(`${origin}/org-manager?auth_error=${encodeURIComponent(code)}`);

export async function handleCallback(
  event: APIGatewayProxyEventV2,
  deps: CallbackDeps = {},
): Promise<APIGatewayProxyStructuredResultV2> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const verifyIdToken = deps.verifyIdToken ?? verifyGoogleIdToken;

  let origin = originOf(event);

  // Outer backstop: the user is mid-redirect in a browser, so a thrown SSM
  // or DynamoDB error here must still become an auth_error redirect, not a
  // raw Lambda failure.
  try {
    const q = event.queryStringParameters ?? {};
    const cfg = await loadAuthConfig();

    const signedState = q.state;
    if (!signedState) return fail(origin, 'sso_failed');
    const state = verifyState(cfg.stateSecret, signedState);
    if (!state) return fail(origin, 'sso_failed');

    if (q.error) return fail(origin, 'sso_failed');

    const pending = await consumeAuthRequest(state);
    if (!pending) return fail(origin, 'expired');
    origin = siteOriginFrom(pending.redirect_uri);

    const code = q.code;
    if (!code) return fail(origin, 'sso_failed');

    try {
      const res = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: pending.redirect_uri,
          grant_type: 'authorization_code',
          code_verifier: pending.code_verifier,
        }).toString(),
      });
      if (!res.ok) return fail(origin, 'sso_failed');

      const payload = (await res.json()) as { id_token?: string };
      if (!payload.id_token) return fail(origin, 'sso_failed');

      const claims = await verifyIdToken(payload.id_token, {
        clientId: cfg.clientId,
        nonce: pending.nonce,
      });

      const identity = await resolveGoogleIdentity(claims, pending.link_to_user_id);

      // Reuse the CLI's grant-code seam, so the site's existing exchange path
      // handles the session with no new session logic.
      const grant = generateWebSessionCode();
      await putWebGrant(grant, identity.user_id, identity.display_name, GRANT_TTL_SECONDS);

      return redirect(`${origin}/org-manager#code=${grant}`);
    } catch (e) {
      if (e instanceof EmailAlreadyLinkedError) return fail(origin, 'email_already_linked');
      return fail(origin, 'sso_failed');
    }
  } catch {
    return fail(origin, 'sso_failed');
  }
}

export const handler: ApiHandler = (event) => handleCallback(event);
