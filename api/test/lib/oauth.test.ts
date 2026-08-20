import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  generatePkce, signState, verifyState, buildAuthorizeUrl, originOf,
  stateCookie, readStateCookie, stateCookieMatches,
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
  const withHeader = (cookie: string) => ({ headers: { cookie } } as unknown as APIGatewayProxyEventV2);

  it('names itself, is HttpOnly, Secure, SameSite=Lax and scoped to /api/auth', () => {
    expect(stateCookie('st-1')).toBe(
      'td_auth_state=st-1; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600',
    );
  });

  it('reads the value out of event.cookies even when it is not first', () => {
    expect(readStateCookie(withCookies(['other=1', 'td_auth_state=st-1', 'z=2']))).toBe('st-1');
  });

  it('reads the value out of a raw Cookie header, tolerating stray spaces', () => {
    expect(readStateCookie(withHeader('other=1;  td_auth_state=st-1 ; z=2'))).toBe('st-1');
  });

  it('is not confused by a cookie whose name merely ends with ours', () => {
    expect(readStateCookie(withCookies(['xtd_auth_state=decoy']))).toBeNull();
  });

  it('returns null when there is no cookie at all', () => {
    expect(readStateCookie({} as APIGatewayProxyEventV2)).toBeNull();
    expect(readStateCookie(withCookies([]))).toBeNull();
    expect(readStateCookie(withHeader(''))).toBeNull();
  });

  it('matches only the exact state', () => {
    expect(stateCookieMatches('st-1', 'st-1')).toBe(true);
    expect(stateCookieMatches('st-2', 'st-1')).toBe(false);
    expect(stateCookieMatches('st-1-longer', 'st-1')).toBe(false);
    expect(stateCookieMatches('', 'st-1')).toBe(false);
    expect(stateCookieMatches(null, 'st-1')).toBe(false);
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
