import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';

vi.mock('../../src/lib/auth-config.js', () => ({
  loadAuthConfig: async () => ({
    clientId: 'cid.apps.googleusercontent.com', clientSecret: 'GOCSPX-x', stateSecret: 'a'.repeat(64),
  }),
}));

import { handleCallback } from '../../src/handlers/auth-google-callback.js';
import { putAuthRequest } from '../../src/db/auth-requests.js';
import * as authRequests from '../../src/db/auth-requests.js';
import { consumeWebGrant } from '../../src/db/web-sessions.js';
import * as webSessions from '../../src/db/web-sessions.js';
import { signState, STATE_COOKIE_NAME } from '../../src/lib/oauth.js';
import { putUser, getUserById } from '../../src/db/users.js';
import { hashSecretToken } from '../../src/lib/auth.js';
import { getUserIdByEmail } from '../../src/db/identities.js';

const REDIRECT = 'https://token-derby.mauricode.co.uk/api/auth/google/callback';
const SECRET = 'a'.repeat(64);

// `cookie` defaults to the state carried by signedState, i.e. the browser that
// started the flow. Pass null for no cookie, or a string for a foreign one.
function ev(code: string, signedState: string, cookie?: string | null): APIGatewayProxyEventV2 {
  const value = cookie === undefined ? signedState.slice(0, signedState.lastIndexOf('.')) : cookie;
  return {
    version: '2.0', routeKey: 'GET /api/auth/google/callback',
    rawPath: '/api/auth/google/callback', rawQueryString: '',
    queryStringParameters: { code, state: signedState },
    headers: { host: 'token-derby.mauricode.co.uk' },
    cookies: value === null ? [] : [`${STATE_COOKIE_NAME}=${value}`],
    requestContext: { domainName: 'token-derby.mauricode.co.uk' } as any,
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

async function seedRequest(over: { link_to_user_id?: string } = {}) {
  const state = randomUUID();
  const nonce = randomUUID();
  await putAuthRequest({
    state, code_verifier: 'v'.repeat(43), nonce, redirect_uri: REDIRECT, ttlSeconds: 600, ...over,
  });
  return { state, nonce, signed: signState(SECRET, state) };
}

const tokenFetch = (idToken: string) => (async () =>
  ({ ok: true, status: 200, json: async () => ({ id_token: idToken }) })) as any;

function deps(claims: any, over: Partial<Record<string, unknown>> = {}) {
  return {
    fetchImpl: tokenFetch('fake-id-token'),
    verifyIdToken: async () => claims,
    ...over,
  } as any;
}

const claimsFor = (email: string, nonce: string, over: any = {}) =>
  ({ sub: 'sub-' + email, email, email_verified: true, given_name: 'Ada', name: 'Ada L', nonce, ...over });

const hashOf = (loc: string) => new URL(loc).hash;
const errOf = (loc: string) => new URL(loc).searchParams.get('auth_error');

describe('auth-google-callback', () => {
  it('creates an account and redirects with a single-use grant code', async () => {
    const { nonce, signed } = await seedRequest();
    const email = `new-${randomUUID()}@example.com`;
    const res: any = await handleCallback(ev('auth-code', signed), deps(claimsFor(email, nonce)));

    expect(res.statusCode).toBe(302);
    const loc = res.headers.location as string;
    expect(loc.startsWith('https://token-derby.mauricode.co.uk/org-manager#code=')).toBe(true);

    const grant = hashOf(loc).replace('#code=', '');
    const consumed = await consumeWebGrant(grant);
    expect(consumed).not.toBeNull();
    expect(consumed!.display_name).toBe('Ada');
    expect(await getUserIdByEmail(email)).toBe(consumed!.user_id);
    // single use
    expect(await consumeWebGrant(grant)).toBeNull();
  });

  it('links to the caller when the pending request carries a link target', async () => {
    const user_id = randomUUID();
    await putUser({ user_id, display_name: 'OldName', created_at: new Date().toISOString() }, hashSecretToken('t'));
    const { nonce, signed } = await seedRequest({ link_to_user_id: user_id });
    const email = `link-${randomUUID()}@example.com`;

    const res: any = await handleCallback(ev('auth-code', signed), deps(claimsFor(email, nonce)));
    expect(res.statusCode).toBe(302);
    const grant = hashOf(res.headers.location).replace('#code=', '');
    const consumed = await consumeWebGrant(grant);
    expect(consumed!.user_id).toBe(user_id);
    // The grant must carry the NEW name, so a later org join cannot write a stale one.
    expect(consumed!.display_name).toBe('Ada');
    expect((await getUserById(user_id))!.display_name).toBe('Ada');
  });

  it('redirects with email_already_linked when the email belongs to someone else', async () => {
    const email = `taken-${randomUUID()}@example.com`;
    const first = await seedRequest();
    await handleCallback(ev('c1', first.signed), deps(claimsFor(email, first.nonce)));

    const other = randomUUID();
    await putUser({ user_id: other, display_name: 'Other', created_at: new Date().toISOString() }, hashSecretToken('t'));
    const second = await seedRequest({ link_to_user_id: other });
    const res: any = await handleCallback(ev('c2', second.signed), deps(claimsFor(email, second.nonce)));
    expect(res.statusCode).toBe(302);
    expect(errOf(res.headers.location)).toBe('email_already_linked');
  });

  it('rejects a replayed callback — the pending request is single-use', async () => {
    const { nonce, signed } = await seedRequest();
    const email = `replay-${randomUUID()}@example.com`;
    const fetchSpy = vi.fn(tokenFetch('fake-id-token'));
    const callDeps = { fetchImpl: fetchSpy, verifyIdToken: async () => claimsFor(email, nonce) } as any;

    await handleCallback(ev('code', signed), callDeps);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const res: any = await handleCallback(ev('code', signed), callDeps);
    expect(errOf(res.headers.location)).toBe('expired');
    // consumption must reject the replay before it can reach the token endpoint again
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects a forged state without touching the table', async () => {
    const consumeSpy = vi.spyOn(authRequests, 'consumeAuthRequest');
    const grantSpy = vi.spyOn(webSessions, 'putWebGrant');
    const fetchSpy = vi.fn(tokenFetch('fake-id-token'));

    const res: any = await handleCallback(ev('code', 'forged.deadbeef'),
      { fetchImpl: fetchSpy, verifyIdToken: async () => claimsFor('x@y.com', 'n') } as any);

    expect(errOf(res.headers.location)).toBe('sso_failed');
    expect(consumeSpy).not.toHaveBeenCalled();
    expect(grantSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    consumeSpy.mockRestore();
    grantSpy.mockRestore();
  });

  it('rejects a callback with no state cookie, before consuming or exchanging anything', async () => {
    const { nonce, signed } = await seedRequest();
    const consumeSpy = vi.spyOn(authRequests, 'consumeAuthRequest');
    const fetchSpy = vi.fn(tokenFetch('fake-id-token'));

    const res: any = await handleCallback(ev('code', signed, null),
      { fetchImpl: fetchSpy, verifyIdToken: async () => claimsFor('nocookie@example.com', nonce) } as any);

    expect(errOf(res.headers.location)).toBe('sso_failed');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(consumeSpy).not.toHaveBeenCalled();
    consumeSpy.mockRestore();
  });

  it('rejects a state cookie belonging to a different flow', async () => {
    const { nonce, signed } = await seedRequest();
    const other = await seedRequest();
    const fetchSpy = vi.fn(tokenFetch('fake-id-token'));

    const res: any = await handleCallback(ev('code', signed, other.state),
      { fetchImpl: fetchSpy, verifyIdToken: async () => claimsFor('wrongcookie@example.com', nonce) } as any);

    expect(errOf(res.headers.location)).toBe('sso_failed');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('leaves the pending request usable by the browser that started it after a cookieless attempt', async () => {
    const { nonce, signed } = await seedRequest();
    const email = `survives-${randomUUID()}@example.com`;
    const fetchSpy = vi.fn(tokenFetch('fake-id-token'));
    const callDeps = { fetchImpl: fetchSpy, verifyIdToken: async () => claimsFor(email, nonce) } as any;

    const blocked: any = await handleCallback(ev('code', signed, null), callDeps);
    expect(errOf(blocked.headers.location)).toBe('sso_failed');

    const real: any = await handleCallback(ev('code', signed), callDeps);
    expect(hashOf(real.headers.location)).toMatch(/^#code=/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not attach a victim email to the attacker when the link flow is completed by another browser', async () => {
    const attacker = randomUUID();
    await putUser({ user_id: attacker, display_name: 'Attacker', created_at: new Date().toISOString() }, hashSecretToken('t'));
    const { nonce, signed } = await seedRequest({ link_to_user_id: attacker });
    const victimEmail = `victim-${randomUUID()}@example.com`;
    const fetchSpy = vi.fn(tokenFetch('fake-id-token'));
    const callDeps = { fetchImpl: fetchSpy, verifyIdToken: async () => claimsFor(victimEmail, nonce) } as any;

    // The victim's browser has no cookie for the attacker's flow.
    const res: any = await handleCallback(ev('code', signed, null), callDeps);

    expect(errOf(res.headers.location)).toBe('sso_failed');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await getUserIdByEmail(victimEmail)).toBeNull();
    const row = await getUserById(attacker);
    expect(row!.display_name).toBe('Attacker');
    expect((row as any).email).toBeUndefined();
  });

  it('rejects an unknown state', async () => {
    const res: any = await handleCallback(ev('code', signState(SECRET, randomUUID())), deps(claimsFor('x@y.com', 'n')));
    expect(errOf(res.headers.location)).toBe('expired');
  });

  it('surfaces a Google error parameter without exchanging anything', async () => {
    const { signed } = await seedRequest();
    const e = ev('some-code', signed);
    (e as any).queryStringParameters = { code: 'some-code', error: 'access_denied', state: signed };
    const fetchSpy = vi.fn(tokenFetch('fake-id-token'));
    const res: any = await handleCallback(e, { fetchImpl: fetchSpy, verifyIdToken: async () => claimsFor('x@y.com', 'n') } as any);
    expect(errOf(res.headers.location)).toBe('sso_failed');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails closed with sso_failed when a dependency throws before the exchange', async () => {
    const { nonce, signed } = await seedRequest();
    const email = `dbfail-${randomUUID()}@example.com`;
    const spy = vi.spyOn(authRequests, 'consumeAuthRequest').mockRejectedValueOnce(new Error('dynamo unavailable'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res: any = await handleCallback(ev('code', signed), deps(claimsFor(email, nonce)));
    // mockRestore also clears the recorded calls, so copy them first.
    const logged = errSpy.mock.calls.map((c) => [...c]);
    spy.mockRestore();
    errSpy.mockRestore();

    expect(res.statusCode).toBe(302);
    expect(errOf(res.headers.location)).toBe('sso_failed');
    // Without this log a C1-class failure is undiagnosable in CloudWatch.
    expect(logged).toHaveLength(1);
    expect(String(logged[0]![0])).toMatch(/sso callback failed/);
    expect(logged[0]![1]).toBeInstanceOf(Error);
  });

  it('fails closed when ID-token verification rejects', async () => {
    const { signed } = await seedRequest();
    const res: any = await handleCallback(ev('code', signed), {
      fetchImpl: tokenFetch('bad'),
      verifyIdToken: async () => { throw new Error('ID token signature is invalid'); },
    } as any);
    expect(errOf(res.headers.location)).toBe('sso_failed');
  });

  it('fails closed when the token endpoint errors', async () => {
    const { signed } = await seedRequest();
    const res: any = await handleCallback(ev('code', signed), {
      fetchImpl: (async () => ({ ok: false, status: 400, text: async () => 'invalid_grant' })) as any,
      verifyIdToken: async () => claimsFor('x@y.com', 'n'),
    } as any);
    expect(errOf(res.headers.location)).toBe('sso_failed');
  });

  it('sends the code_verifier and redirect_uri to the token endpoint', async () => {
    const { nonce, signed } = await seedRequest();
    let body = '';
    const res: any = await handleCallback(ev('the-code', signed), {
      fetchImpl: (async (_u: string, init: any) => {
        body = String(init.body);
        return { ok: true, status: 200, json: async () => ({ id_token: 'tok' }) };
      }) as any,
      verifyIdToken: async () => claimsFor(`verif-${randomUUID()}@example.com`, nonce),
    } as any);
    expect(res.statusCode).toBe(302);
    const p = new URLSearchParams(body);
    expect(p.get('code')).toBe('the-code');
    expect(p.get('grant_type')).toBe('authorization_code');
    expect(p.get('code_verifier')).toBe('v'.repeat(43));
    expect(p.get('redirect_uri')).toBe(REDIRECT);
    expect(p.get('client_secret')).toBe('GOCSPX-x');
  });
});
