import { describe, it, expect, vi } from 'vitest';
import './../setup.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { signSession } from '../../src/lib/admin-auth.js';

const SECRET = 'unclaim-secret';
vi.mock('../../src/lib/admin-config.js', () => ({
  loadAdminConfig: vi.fn(async () => ({ username: 'omar', passwordHash: 'x:y', sessionSecret: SECRET })),
}));

// Simulates the fan-out Scan failing before any Slack post is sent — the
// only case unclaimRelease is meant to handle.
vi.mock('../../src/db/organisations.js', () => ({
  listOrgsWithSlackRelease: vi.fn(async () => { throw new Error('scan failed'); }),
}));

import { handler } from '../../src/handlers/admin-announce-release.js';
import { claimRelease } from '../../src/db/releases.js';

const token = () => signSession(SECRET, { sub: 'admin', exp: Math.floor(Date.now() / 1000) + 60 });

function ev(body?: unknown, tok?: string): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (tok) headers['authorization'] = `Bearer ${tok}`;
  return { headers, body: body === undefined ? undefined : JSON.stringify(body) } as unknown as APIGatewayProxyEventV2;
}

const good = (version: string) => ({ component: 'cli', version, date: '2026-07-28', changes: ['a fix'] });
const call = (body?: unknown, tok?: string) => handler(ev(body, tok) as any, {} as any, {} as any) as Promise<any>;
const uniq = () => `9.9.${Math.floor(Math.random() * 100000)}`;

describe('admin-announce-release: fan-out failure', () => {
  it('releases the claim when listOrgsWithSlackRelease throws, so a retry can re-announce', async () => {
    const version = uniq();

    await expect(call(good(version), token())).rejects.toThrow('scan failed');

    // The marker must be gone — otherwise this would come back false and a
    // retry would be misreported as a harmless duplicate.
    expect(await claimRelease(good(version) as any)).toBe(true);
  });
});
