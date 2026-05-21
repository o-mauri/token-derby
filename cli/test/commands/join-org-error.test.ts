import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { saveIdentity } from '../../src/identity/identity.js';
import { _resetIdentityCacheForTests } from '../../src/api/client.js';

let tmp: string;
let errors: string[] = [];
let origError: typeof console.error;
let origLog: typeof console.log;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-join-'));
  process.env.TOKEN_DERBY_HOME = tmp;
  _resetIdentityCacheForTests();
  errors = [];
  origError = console.error;
  origLog = console.log;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
  console.log = () => {};
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
  _resetIdentityCacheForTests();
  console.error = origError;
  console.log = origLog;
});

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
  };
}

const ORG_RACE = {
  race_id: 'r1', name: 'Org Race',
  start_time: '2026-05-14T10:00:00Z', end_time: '2026-05-14T11:00:00Z',
  tz: 'UTC', max_participants: 30, join_code: 'ABC123',
  created_at: '2026-05-14T09:00:00Z',
  status: 'live', horses: [],
  server_time: '2026-05-14T10:30:00Z',
  time_left_seconds: 1800,
  org_id: 'o1', organisation_name: 'OnlyMembers',
};

async function setupIdentity() {
  await saveIdentity({
    user_id: '12345678-1234-1234-1234-123456789012',
    display_name: 'Outsider',
    secret_token: 's',
    created_at: '2026-05-14T10:00:00Z',
  });
}

describe('joinCommand — outsider trying to join an org-restricted race', () => {
  it('reports the org-membership error early (before any stable / picker prompts) when the user has no stable horses', async () => {
    await setupIdentity();
    const fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.match(/\/races\/[A-Z0-9]+$/)) return ok(ORG_RACE);
      if (u.endsWith('/organisations')) return ok({ organisations: [] });
      throw new Error(`unexpected url ${u}`);
    });
    (globalThis as any).fetch = fetch;

    const { joinCommand } = await import('../../src/commands/join.js');
    const rc = await joinCommand('ABC123');

    expect(rc).toBe(1);
    const combined = errors.join('\n');
    expect(combined).toMatch(/OnlyMembers/);
    expect(combined).toMatch(/restricted/i);
    expect(combined).not.toMatch(/stable is empty/i);
    expect(combined).not.toMatch(/horse_id/i);
    // We should never call listStable / join when membership is the issue.
    const urls = fetch.mock.calls.map(c => String(c[0]));
    expect(urls.some(u => u.includes('/jockey/me/horses'))).toBe(false);
    expect(urls.some(u => u.endsWith('/join'))).toBe(false);
  });

  it('still falls back to the server check if listOrganisations fails (defensive)', async () => {
    await setupIdentity();
    const fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.match(/\/races\/[A-Z0-9]+$/)) return ok(ORG_RACE);
      if (u.endsWith('/organisations')) {
        return {
          ok: false, status: 500,
          headers: { get: () => 'application/json' },
          text: async () => JSON.stringify({ code: 'INTERNAL', message: 'boom' }),
        };
      }
      if (u.endsWith('/jockey/me/horses')) return ok({ horses: [] });
      throw new Error(`unexpected url ${u}`);
    });
    (globalThis as any).fetch = fetch;

    const { joinCommand } = await import('../../src/commands/join.js');
    const rc = await joinCommand('ABC123');

    expect(rc).toBe(1);
    // Network fallback path uses the original "stable is empty" message.
    expect(errors.join('\n')).toMatch(/stable is empty/i);
  });
});
