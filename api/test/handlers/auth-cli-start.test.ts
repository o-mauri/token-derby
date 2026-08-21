import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { JOIN_CODE_ALPHABET } from '@token-derby/shared';
import { handler as cliStart } from '../../src/handlers/auth-cli-start.js';
import { putCliAuthRequest, getCliAuthRequest, getCliAuthRequestByUserCode } from '../../src/db/cli-auth-requests.js';
import { makeUser, authHeaders } from '../helpers/auth-helper.js';

function ev(over: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /api/auth/cli/start',
    rawPath: '/api/auth/cli/start',
    rawQueryString: '',
    headers: { host: 'token-derby.mauricode.co.uk', 'content-type': 'application/json' },
    requestContext: { domainName: 'token-derby.mauricode.co.uk' } as any,
    body: JSON.stringify({ label: 'omars-laptop' }),
    isBase64Encoded: false,
    ...over,
  } as APIGatewayProxyEventV2;
}

const originalSiteOrigin = process.env.SITE_ORIGIN;
beforeEach(() => {
  process.env.SITE_ORIGIN = 'https://token-derby.mauricode.co.uk';
});
afterEach(() => {
  if (originalSiteOrigin === undefined) delete process.env.SITE_ORIGIN;
  else process.env.SITE_ORIGIN = originalSiteOrigin;
});

describe('auth-cli-start', () => {
  it('returns two distinct codes of the expected shapes', async () => {
    const res: any = await cliStart(ev());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // device_code: 32 random bytes, base64url — the long secret used to poll.
    expect(body.device_code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // user_code: 6 chars over the join-code alphabet — the short human-typed code.
    expect(body.user_code).toHaveLength(6);
    for (const ch of body.user_code as string) {
      expect(JOIN_CODE_ALPHABET).toContain(ch);
    }
    expect(body.device_code).not.toBe(body.user_code);
    expect(typeof body.interval).toBe('number');
    expect(typeof body.expires_in).toBe('number');
  });

  it('produces different codes on every call', async () => {
    const resA: any = await cliStart(ev());
    const resB: any = await cliStart(ev());
    const a = JSON.parse(resA.body);
    const b = JSON.parse(resB.body);
    expect(a.device_code).not.toBe(b.device_code);
    expect(a.user_code).not.toBe(b.user_code);
  });

  it('persists the pending request so the returned device_code resolves it', async () => {
    const res: any = await cliStart(ev({ body: JSON.stringify({ label: 'my-machine' }) }));
    const { device_code, user_code } = JSON.parse(res.body);
    const pending = await getCliAuthRequest(device_code);
    expect(pending).not.toBeNull();
    expect(pending!.user_code).toBe(user_code);
    expect(pending!.label).toBe('my-machine');
    expect(pending!.status).toBe('pending');
    expect(pending!.link_to_user_id).toBeUndefined();
  });

  describe('verification_uri', () => {
    it('is built from SITE_ORIGIN, ignoring a hostile Host header', async () => {
      const res: any = await cliStart(ev({
        headers: { host: 'evil.example.com', 'content-type': 'application/json' },
        requestContext: { domainName: 'evil.example.com' } as any,
      }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.verification_uri).toBe('https://token-derby.mauricode.co.uk/cli');
    });

    it('is built from SITE_ORIGIN, ignoring the execute-api host CloudFront actually sends', async () => {
      const res: any = await cliStart(ev({
        headers: { host: 'abc123.execute-api.eu-west-2.amazonaws.com', 'content-type': 'application/json' },
        requestContext: { domainName: 'abc123.execute-api.eu-west-2.amazonaws.com' } as any,
      }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.verification_uri).toBe('https://token-derby.mauricode.co.uk/cli');
      expect(body.verification_uri).not.toContain('execute-api');
    });

    it('carries no code — the code is typed, not clicked', async () => {
      const res: any = await cliStart(ev());
      const body = JSON.parse(res.body);
      expect(body.verification_uri).not.toContain(body.user_code);
    });
  });

  describe('link_to_user_id', () => {
    it('is recorded when the request carries valid CLI credentials', async () => {
      const user = await makeUser('Linker');
      const res: any = await cliStart(ev({ headers: { ...authHeaders(user), 'content-type': 'application/json' } }));
      expect(res.statusCode).toBe(200);
      const { device_code } = JSON.parse(res.body);
      const pending = await getCliAuthRequest(device_code);
      expect(pending!.link_to_user_id).toBe(user.user_id);
    });

    it('is absent when no credentials are sent', async () => {
      const res: any = await cliStart(ev());
      const { device_code } = JSON.parse(res.body);
      const pending = await getCliAuthRequest(device_code);
      expect(pending!.link_to_user_id).toBeUndefined();
    });

    it('is absent, and the request still succeeds, when the token is wrong for a real user', async () => {
      const user = await makeUser('Victim');
      const res: any = await cliStart(ev({
        headers: {
          'x-user-id': user.user_id,
          'x-user-token': 'not-the-real-token',
          'content-type': 'application/json',
        },
      }));
      expect(res.statusCode).toBe(200);
      const { device_code } = JSON.parse(res.body);
      const pending = await getCliAuthRequest(device_code);
      expect(pending!.link_to_user_id).toBeUndefined();
    });

    it('is absent, and the request still succeeds, for a stale identity.json pointing at a user_id that no longer exists', async () => {
      const res: any = await cliStart(ev({
        headers: {
          'x-user-id': randomUUID(),
          'x-user-token': 'some-old-token',
          'content-type': 'application/json',
        },
      }));
      expect(res.statusCode).toBe(200);
      const { device_code } = JSON.parse(res.body);
      const pending = await getCliAuthRequest(device_code);
      expect(pending!.link_to_user_id).toBeUndefined();
    });

    it('never accepts a user-supplied link_to_user_id in the body', async () => {
      const attacker = randomUUID();
      const res: any = await cliStart(ev({
        body: JSON.stringify({ label: 'x', link_to_user_id: attacker }),
      }));
      expect(res.statusCode).toBe(200);
      const { device_code } = JSON.parse(res.body);
      const pending = await getCliAuthRequest(device_code);
      expect(pending!.link_to_user_id).toBeUndefined();
    });
  });

  describe('label validation', () => {
    it('rejects a missing label', async () => {
      const res: any = await cliStart(ev({ body: JSON.stringify({}) }));
      expect(res.statusCode).toBe(400);
    });

    it('rejects a non-string label', async () => {
      const res: any = await cliStart(ev({ body: JSON.stringify({ label: 42 }) }));
      expect(res.statusCode).toBe(400);
    });

    it('rejects a blank label', async () => {
      const res: any = await cliStart(ev({ body: JSON.stringify({ label: '   ' }) }));
      expect(res.statusCode).toBe(400);
    });

    it('rejects a label over the max length', async () => {
      const res: any = await cliStart(ev({ body: JSON.stringify({ label: 'x'.repeat(41) }) }));
      expect(res.statusCode).toBe(400);
    });

    it('accepts a label at exactly the max length', async () => {
      const res: any = await cliStart(ev({ body: JSON.stringify({ label: 'x'.repeat(40) }) }));
      expect(res.statusCode).toBe(200);
    });

    it('does not write a pending row when the label is rejected', async () => {
      const dbModule = await import('../../src/db/cli-auth-requests.js');
      const spy = vi.spyOn(dbModule, 'putCliAuthRequest');
      const res: any = await cliStart(ev({ body: JSON.stringify({ label: 'x'.repeat(41) }) }));
      expect(res.statusCode).toBe(400);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('rejects a label containing a right-to-left override (U+202E)', async () => {
      const res: any = await cliStart(ev({ body: JSON.stringify({ label: 'AB3D92‮cod.exe' }) }));
      expect(res.statusCode).toBe(400);
    });

    it('rejects a label containing a zero-width space (U+200B)', async () => {
      const res: any = await cliStart(ev({ body: JSON.stringify({ label: 'omars​laptop' }) }));
      expect(res.statusCode).toBe(400);
    });

    it('does not write a pending row when the label has a bidi override', async () => {
      const dbModule = await import('../../src/db/cli-auth-requests.js');
      const spy = vi.spyOn(dbModule, 'putCliAuthRequest');
      const res: any = await cliStart(ev({ body: JSON.stringify({ label: 'AB3D92‮cod.exe' }) }));
      expect(res.statusCode).toBe(400);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('does not write a pending row when the label has a zero-width space', async () => {
      const dbModule = await import('../../src/db/cli-auth-requests.js');
      const spy = vi.spyOn(dbModule, 'putCliAuthRequest');
      const res: any = await cliStart(ev({ body: JSON.stringify({ label: 'omars​laptop' }) }));
      expect(res.statusCode).toBe(400);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('accepts a label with legitimate non-ASCII: accents and a CJK character', async () => {
      const res: any = await cliStart(ev({ body: JSON.stringify({ label: "Amélie's PC 笔记本" }) }));
      expect(res.statusCode).toBe(200);
    });
  });

  describe('user_code collision', () => {
    it('retries with a fresh user_code rather than surfacing the collision, and leaves the original row untouched', async () => {
      const codes = await import('../../src/lib/codes.js');

      const collidingUserCode = 'CDEFGH';
      const collidingDeviceCode = `held-${randomUUID()}`;
      await putCliAuthRequest({
        device_code: collidingDeviceCode,
        user_code: collidingUserCode,
        label: 'holder',
        ttlSeconds: 600,
      });

      const spy = vi.spyOn(codes, 'generateJoinCode');
      spy.mockImplementationOnce(() => collidingUserCode);

      const res: any = await cliStart(ev({ body: JSON.stringify({ label: 'retrier' }) }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      // The retry must have actually happened (proves the collision path ran,
      // not that generateJoinCode happened to avoid it).
      expect(spy).toHaveBeenCalledTimes(2);
      expect(body.user_code).not.toBe(collidingUserCode);

      // The winning response resolves to the NEW device_code, not the held one.
      const resolved = await getCliAuthRequestByUserCode(body.user_code);
      expect(resolved!.device_code).toBe(body.device_code);

      // The original pending request must be untouched — the retry did not
      // clobber it, it generated a genuinely different user_code instead.
      const original = await getCliAuthRequestByUserCode(collidingUserCode);
      expect(original!.device_code).toBe(collidingDeviceCode);
      expect(original!.label).toBe('holder');

      spy.mockRestore();
    });

    it('surfaces the error after exhausting retries rather than looping forever', async () => {
      const codes = await import('../../src/lib/codes.js');
      const spy = vi.spyOn(codes, 'generateJoinCode').mockImplementation(() => 'ALWAYS');

      await putCliAuthRequest({
        device_code: `held2-${randomUUID()}`,
        user_code: 'ALWAYS',
        label: 'holder2',
        ttlSeconds: 600,
      });

      await expect(cliStart(ev({ body: JSON.stringify({ label: 'never-succeeds' }) })))
        .rejects.toThrow(/user_code/);

      spy.mockRestore();
    });
  });
});
