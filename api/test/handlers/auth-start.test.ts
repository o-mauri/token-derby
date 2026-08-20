import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

vi.mock('../../src/lib/auth-config.js', () => ({
  loadAuthConfig: async () => ({
    clientId: 'cid.apps.googleusercontent.com',
    clientSecret: 'GOCSPX-x',
    stateSecret: 'a'.repeat(64),
  }),
}));

import { handler as googleStart } from '../../src/handlers/auth-google-start.js';
import { handler as linkStart } from '../../src/handlers/auth-link-start.js';
import { consumeAuthRequest } from '../../src/db/auth-requests.js';
import { putWebSession } from '../../src/db/web-sessions.js';
import { verifyState, STATE_COOKIE_NAME } from '../../src/lib/oauth.js';
import { randomUUID } from 'node:crypto';

function ev(over: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'GET /api/auth/google/start', rawPath: '/api/auth/google/start',
    rawQueryString: '', headers: { host: 'token-derby.mauricode.co.uk' },
    requestContext: { domainName: 'token-derby.mauricode.co.uk' } as any,
    isBase64Encoded: false, ...over,
  } as APIGatewayProxyEventV2;
}

const stateFromUrl = (url: string) => new URL(url).searchParams.get('state')!;

beforeEach(() => vi.clearAllMocks());

describe('auth-google-start', () => {
  it('302s to Google with PKCE and stores the pending request', async () => {
    const res: any = await googleStart(ev());
    expect(res.statusCode).toBe(302);
    const loc = res.headers.location as string;
    expect(loc).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    const url = new URL(loc);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri'))
      .toBe('https://token-derby.mauricode.co.uk/api/auth/google/callback');

    const state = verifyState('a'.repeat(64), stateFromUrl(loc));
    expect(state).not.toBeNull();
    // The cookie is what binds the callback to this browser.
    expect(res.cookies).toEqual([
      `${STATE_COOKIE_NAME}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600`,
    ]);
    const pending = await consumeAuthRequest(state!);
    expect(pending).not.toBeNull();
    expect(pending!.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pending!.nonce).toBe(url.searchParams.get('nonce'));
    expect(pending!.link_to_user_id).toBeUndefined();
  });

  it('builds the redirect_uri from SITE_ORIGIN, not the Host CloudFront rewrites', async () => {
    const before = process.env.SITE_ORIGIN;
    process.env.SITE_ORIGIN = 'https://token-derby.mauricode.co.uk';
    try {
      const res: any = await googleStart(ev({
        headers: { host: 'abc123.execute-api.eu-west-2.amazonaws.com' },
        requestContext: { domainName: 'abc123.execute-api.eu-west-2.amazonaws.com' } as any,
      }));
      const loc = res.headers.location as string;
      expect(new URL(loc).searchParams.get('redirect_uri'))
        .toBe('https://token-derby.mauricode.co.uk/api/auth/google/callback');

      const state = verifyState('a'.repeat(64), stateFromUrl(loc))!;
      const pending = await consumeAuthRequest(state);
      expect(pending!.redirect_uri).toBe('https://token-derby.mauricode.co.uk/api/auth/google/callback');
    } finally {
      if (before === undefined) delete process.env.SITE_ORIGIN;
      else process.env.SITE_ORIGIN = before;
    }
  });
});

describe('auth-link-start', () => {
  it('rejects an unauthenticated caller', async () => {
    const res: any = await linkStart(ev({ routeKey: 'POST /api/auth/link/start' }));
    expect(res.statusCode).toBe(401);
  });

  it('does no work at all before authenticating', async () => {
    const cfg = await import('../../src/lib/auth-config.js');
    const reqs = await import('../../src/db/auth-requests.js');
    const cfgSpy = vi.spyOn(cfg, 'loadAuthConfig');
    const putSpy = vi.spyOn(reqs, 'putAuthRequest');

    const res: any = await linkStart(ev({ routeKey: 'POST /api/auth/link/start' }));

    expect(res.statusCode).toBe(401);
    expect(cfgSpy).not.toHaveBeenCalled();
    expect(putSpy).not.toHaveBeenCalled();
    cfgSpy.mockRestore();
    putSpy.mockRestore();
  });

  it('returns an authorize_url carrying the caller as the link target', async () => {
    const user_id = randomUUID();
    const token = randomUUID();
    await putWebSession(token, user_id, 'Linker', new Date(Date.now() + 3_600_000).toISOString(), 3600);

    const res: any = await linkStart(ev({
      routeKey: 'POST /api/auth/link/start',
      headers: { host: 'token-derby.mauricode.co.uk', authorization: `Bearer ${token}` },
    }));
    expect(res.statusCode).toBe(200);
    const { authorize_url } = JSON.parse(res.body);
    expect(authorize_url).toContain('accounts.google.com');

    const state = verifyState('a'.repeat(64), stateFromUrl(authorize_url))!;
    expect(res.cookies).toEqual([
      `${STATE_COOKIE_NAME}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600`,
    ]);
    const pending = await consumeAuthRequest(state);
    expect(pending!.link_to_user_id).toBe(user_id);
  });

  it('ignores a link_to_user_id supplied by the caller', async () => {
    const attacker = randomUUID();
    const victim = randomUUID();
    const token = randomUUID();
    await putWebSession(token, attacker, 'Attacker', new Date(Date.now() + 3_600_000).toISOString(), 3600);

    const res: any = await linkStart(ev({
      routeKey: 'POST /api/auth/link/start',
      headers: { host: 'token-derby.mauricode.co.uk', authorization: `Bearer ${token}` },
      body: JSON.stringify({ link_to_user_id: victim }),
      queryStringParameters: { link_to_user_id: victim },
    }));
    expect(res.statusCode).toBe(200);

    const state = verifyState('a'.repeat(64), stateFromUrl(JSON.parse(res.body).authorize_url))!;
    const pending = await consumeAuthRequest(state);
    // The link target must come from the session, never from the request.
    expect(pending!.link_to_user_id).toBe(attacker);
    expect(pending!.link_to_user_id).not.toBe(victim);
  });
});
