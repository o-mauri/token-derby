import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { sendOrgWebhook } from '../../src/lib/webhook.js';

type OrgWithWebhook = {
  org_id: string;
  org_name: string;
  webhook_url?: string;
  webhook_secret?: string;
};

function makeOrg(overrides: Partial<OrgWithWebhook> = {}): OrgWithWebhook {
  return {
    org_id: 'org-1',
    org_name: 'Acme',
    webhook_url: undefined,
    webhook_secret: undefined,
    ...overrides,
  };
}

function startServer(handler: (req: any, res: any, body: string) => void): Promise<{ server: Server; url: string }> {
  return new Promise(resolve => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => handler(req, res, body));
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe('sendOrgWebhook', () => {
  let server: Server | undefined;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    if (server) await new Promise(r => server!.close(() => r(null)));
    server = undefined;
  });

  it('is a no-op when webhook_url is missing', async () => {
    await sendOrgWebhook(makeOrg(), 'race.created', { hello: 'world' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('POSTs JSON with an HMAC signature header and event headers', async () => {
    let received: { headers: Record<string, string>; body: string } | undefined;
    const started = await startServer((req, res, body) => {
      received = { headers: req.headers as any, body };
      res.statusCode = 200;
      res.end();
    });
    server = started.server;

    const secret = 'shhh';
    await sendOrgWebhook(
      makeOrg({ webhook_url: started.url, webhook_secret: secret }),
      'race.created',
      { hello: 'world' },
    );

    expect(received).toBeDefined();
    expect(received!.headers['content-type']).toBe('application/json');
    expect(received!.headers['x-token-derby-event']).toBe('race.created');
    expect(received!.headers['x-token-derby-delivery']).toMatch(/^[0-9a-f-]{36}$/);

    const expectedSig = 'sha256=' + createHmac('sha256', secret).update(received!.body).digest('hex');
    const given = received!.headers['x-token-derby-signature'];
    expect(given).toBeDefined();
    expect(
      timingSafeEqual(Buffer.from(given!), Buffer.from(expectedSig)),
    ).toBe(true);
    expect(JSON.parse(received!.body)).toMatchObject({ hello: 'world' });
  });

  it('swallows non-2xx responses and logs a warning', async () => {
    const started = await startServer((_req, res) => {
      res.statusCode = 500;
      res.end('boom');
    });
    server = started.server;
    await expect(
      sendOrgWebhook(
        makeOrg({ webhook_url: started.url, webhook_secret: 's' }),
        'race.ended',
        { ok: true },
      ),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('aborts and swallows when the receiver hangs past the timeout', async () => {
    const started = await startServer(() => { /* never respond */ });
    server = started.server;

    const t0 = Date.now();
    await sendOrgWebhook(
      makeOrg({ webhook_url: started.url, webhook_secret: 's' }),
      'race.ended',
      { ok: true },
      { timeoutMs: 50 },
    );
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(warnSpy).toHaveBeenCalled();
  });
});
