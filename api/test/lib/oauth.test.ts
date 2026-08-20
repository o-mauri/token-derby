import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  generatePkce, signState, verifyState, buildAuthorizeUrl, originOf,
  stateCookie, stateCookieName, hasStateCookie, STATE_COOKIE_PREFIX, STATE_COOKIE_TTL_SECONDS,
  AUTH_REQUEST_TTL_SECONDS,
} from '../../src/lib/oauth.js';

describe('generatePkce', () => {
  it('produces a 43-char base64url verifier and its S256 challenge', () => {
    const { verifier, challenge } = generatePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
  it('is different every call', () => {
    expect(generatePkce().verifier).not.toBe(generatePkce().verifier);
  });
});

describe('state signing', () => {
  it('round-trips', () => {
    const signed = signState('secret', 'abc123');
    expect(verifyState('secret', signed)).toBe('abc123');
  });
  it('rejects a tampered state', () => {
    const signed = signState('secret', 'abc123');
    expect(verifyState('secret', signed.replace('abc123', 'abc124'))).toBeNull();
  });
  it('rejects a wrong secret', () => {
    expect(verifyState('other', signState('secret', 'abc123'))).toBeNull();
  });
  it('rejects malformed input', () => {
    expect(verifyState('secret', 'no-dot')).toBeNull();
    expect(verifyState('secret', '')).toBeNull();
  });
});

describe('the state cookie', () => {
  const withCookies = (cookies: string[]) => ({ cookies } as unknown as APIGatewayProxyEventV2);

  it('carries the state in its NAME so concurrent flows cannot overwrite each other', () => {
    expect(stateCookieName('st-1')).toBe('td_auth_state_st-1');
    expect(stateCookie('st-1')).toBe(
      'td_auth_state_st-1=1; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=660',
    );
    // Two flows produce two differently NAMED cookies, so a browser keeps both.
    expect(stateCookie('st-2')).not.toBe(stateCookie('st-1'));
    expect(stateCookieName('st-2')).not.toBe(stateCookieName('st-1'));
  });

  it('outlives the pending request, so a slow consent screen reports expired not sso_failed', () => {
    expect(STATE_COOKIE_TTL_SECONDS).toBeGreaterThan(AUTH_REQUEST_TTL_SECONDS);
    expect(stateCookie('st-1')).toContain(`Max-Age=${STATE_COOKIE_TTL_SECONDS}`);
  });

  it('accepts its own cookie among others, in any position', () => {
    expect(hasStateCookie(withCookies(['other=1', stateCookie('st-1').split(';')[0]!, 'z=2']), 'st-1'))
      .toBe(true);
    expect(hasStateCookie(withCookies(['td_auth_state_st-9=1', 'td_auth_state_st-1=1']), 'st-1'))
      .toBe(true);
  });

  it('rejects a cookie for a different flow', () => {
    expect(hasStateCookie(withCookies(['td_auth_state_st-2=1']), 'st-1')).toBe(false);
  });

  it('rejects a name that merely contains the prefix rather than starting with it', () => {
    expect(hasStateCookie(withCookies([`x${STATE_COOKIE_PREFIX}st-1=1`]), 'st-1')).toBe(false);
    expect(hasStateCookie(withCookies(['td_auth_state_st-1-longer=1']), 'st-1')).toBe(false);
  });

  it('rejects an empty value under the right name', () => {
    expect(hasStateCookie(withCookies(['td_auth_state_st-1=']), 'st-1')).toBe(false);
    expect(hasStateCookie(withCookies(['td_auth_state_st-1']), 'st-1')).toBe(false);
  });

  it('rejects when there is no cookie at all', () => {
    expect(hasStateCookie({} as APIGatewayProxyEventV2, 'st-1')).toBe(false);
    expect(hasStateCookie(withCookies([]), 'st-1')).toBe(false);
  });

  it('rejects an empty state, so a bare prefix cookie can never satisfy the guard', () => {
    expect(hasStateCookie(withCookies([`${STATE_COOKIE_PREFIX}=1`]), '')).toBe(false);
  });
});

describe('originOf', () => {
  const ev = (host?: string, domainName?: string) => ({
    headers: host ? { host } : {},
    requestContext: domainName ? { domainName } : {},
  } as unknown as APIGatewayProxyEventV2);

  const originalSiteOrigin = process.env.SITE_ORIGIN;
  afterEach(() => {
    if (originalSiteOrigin === undefined) delete process.env.SITE_ORIGIN;
    else process.env.SITE_ORIGIN = originalSiteOrigin;
  });

  it('prefers SITE_ORIGIN over the Host header CloudFront rewrites', () => {
    process.env.SITE_ORIGIN = 'https://token-derby.mauricode.co.uk';
    expect(originOf(ev('abc123.execute-api.eu-west-2.amazonaws.com')))
      .toBe('https://token-derby.mauricode.co.uk');
  });

  it('prefers SITE_ORIGIN over a host an attacker controls', () => {
    process.env.SITE_ORIGIN = 'https://token-derby.mauricode.co.uk';
    expect(originOf(ev('evil.example.com', 'evil.example.com')))
      .toBe('https://token-derby.mauricode.co.uk');
  });

  it('strips a trailing slash from SITE_ORIGIN so the callback path stays well formed', () => {
    process.env.SITE_ORIGIN = 'https://token-derby.mauricode.co.uk/';
    expect(originOf(ev('anything'))).toBe('https://token-derby.mauricode.co.uk');
  });

  it('ignores a blank SITE_ORIGIN and falls back to the host', () => {
    process.env.SITE_ORIGIN = '   ';
    expect(originOf(ev('token-derby.mauricode.co.uk'))).toBe('https://token-derby.mauricode.co.uk');
  });

  it('falls back to the Host header when SITE_ORIGIN is unset', () => {
    delete process.env.SITE_ORIGIN;
    expect(originOf(ev('token-derby.mauricode.co.uk'))).toBe('https://token-derby.mauricode.co.uk');
  });

  it('falls back to requestContext.domainName when there is no Host header', () => {
    delete process.env.SITE_ORIGIN;
    expect(originOf(ev(undefined, 'token-derby.mauricode.co.uk'))).toBe('https://token-derby.mauricode.co.uk');
  });

  it('uses http for the local harness', () => {
    delete process.env.SITE_ORIGIN;
    expect(originOf(ev('localhost:3000'))).toBe('http://localhost:3000');
    expect(originOf(ev('127.0.0.1:3000'))).toBe('http://127.0.0.1:3000');
  });
});

describe('buildAuthorizeUrl', () => {
  it('includes every parameter Google needs', () => {
    const url = new URL(buildAuthorizeUrl({
      clientId: 'cid', redirectUri: 'https://example.com/api/auth/google/callback',
      state: 'st', nonce: 'no', challenge: 'ch',
    }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/api/auth/google/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('nonce')).toBe('no');
    expect(url.searchParams.get('code_challenge')).toBe('ch');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});
